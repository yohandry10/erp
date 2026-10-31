use base64::{engine::general_purpose::STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::collections::HashSet;

const MARKER: &str = "placeholder";

struct ResolvedRoute {
    asset: String,
    id: String,
}

// Only match an exported business template, never an arbitrary filesystem path.
fn resolve_route(
    path: &str,
    templates: &[String],
    exported_assets: &HashSet<String>,
) -> Option<ResolvedRoute> {
    let path = path.trim_start_matches('/');
    let mut candidates = vec![path.to_string()];
    if !path.ends_with(".html") && !path.ends_with(".txt") {
        candidates.push(format!("{}/index.html", path.trim_end_matches('/')));
    } else if path.ends_with(".txt") && !path.ends_with("/index.txt") {
        candidates.push(format!("{}/index.txt", path.trim_end_matches(".txt")));
    }
    // An exported literal route takes precedence over its sibling [id] template.
    if candidates.iter().any(|path| exported_assets.contains(path)) {
        return None;
    }
    for candidate in candidates {
        let parts: Vec<_> = candidate.split('/').collect();
        for template in templates {
            let pattern: Vec<_> = template.trim_start_matches('/').split('/').collect();
            if pattern.len() != parts.len() {
                continue;
            }
            let mut id = None;
            let mut matched = true;
            for (expected, actual) in pattern.iter().zip(&parts) {
                if *expected == MARKER {
                    if id.is_some()
                        || actual.is_empty()
                        || actual.len() > 128
                        || *actual == "."
                        || *actual == ".."
                        || !actual
                            .bytes()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_' | b'.'))
                    {
                        matched = false;
                        break;
                    }
                    id = Some((*actual).to_string());
                } else if expected != actual {
                    matched = false;
                    break;
                }
            }
            if matched {
                if let Some(id) = id {
                    return Some(ResolvedRoute {
                        asset: template.clone(),
                        id,
                    });
                }
            }
        }
    }
    None
}

// Next embeds the route tree as JSON, either directly in RSC or escaped in
// HTML. Replace array segments only; preserve JSX props named "placeholder".
fn render_route(body: &str, id: &str) -> String {
    body.replace(",\"placeholder\",", &format!(",\"{id}\","))
        .replace("[\"placeholder\",", &format!("[\"{id}\","))
        .replace(",\\\"placeholder\\\",", &format!(",\\\"{id}\\\","))
        .replace("[\\\"placeholder\\\",", &format!("[\\\"{id}\\\","))
}

fn inline_scripts(mut html: &str) -> Vec<&str> {
    let mut scripts = Vec::new();
    while let Some(start) = html.find("<script") {
        html = &html[start..];
        let Some(open) = html.find('>') else {
            break;
        };
        html = &html[open + 1..];
        let Some(close) = html.find("</script>") else {
            break;
        };
        scripts.push(&html[..close]);
        html = &html[close + "</script>".len()..];
    }
    scripts
}

fn script_hash(script: &str) -> String {
    format!(
        "'sha256-{}'",
        STANDARD.encode(Sha256::digest(script.as_bytes()))
    )
}

fn route_csp(original: &str, rendered: &str, csp: &str) -> String {
    let mut updated = csp.to_string();
    for (before, after) in inline_scripts(original)
        .into_iter()
        .zip(inline_scripts(rendered))
    {
        if before != after {
            // Replace an existing allow hash; never widen directives or add
            // unsafe-inline. Unchanged boot scripts keep their original hashes.
            updated = updated.replace(&script_hash(before), &script_hash(after));
        }
    }
    updated
}

pub fn create_windows(app: &tauri::App) -> tauri::Result<()> {
    for config in &app.config().app.windows {
        let handle = app.handle().clone();
        let exported_assets: HashSet<String> = app
            .asset_resolver()
            .iter()
            .map(|(key, _)| key.trim_start_matches('/').to_string())
            .collect();
        let templates: Vec<String> = exported_assets
            .iter()
            .filter(|key| {
                key.trim_start_matches('/').starts_with("dashboard/")
                    && key.split('/').any(|part| part == MARKER)
                    && (key.ends_with(".html") || key.ends_with(".txt"))
            })
            .cloned()
            .collect();
        tauri::WebviewWindowBuilder::from_config(app, config)?
            .on_web_resource_request(move |request, response| {
                let local = (request.uri().scheme_str() == Some("tauri")
                    && request.uri().authority().map(|a| a.as_str()) == Some("localhost"))
                    || (request.uri().scheme_str() == Some("http")
                        && request.uri().authority().map(|a| a.as_str())
                            == Some("tauri.localhost"));
                if !local || request.method() != tauri::http::Method::GET {
                    return;
                }
                let Some(route) = resolve_route(request.uri().path(), &templates, &exported_assets)
                else {
                    return;
                };
                // Preserve Tauri's CSP/nonces; only substitute the route ID.
                let Some(asset) = handle
                    .asset_resolver()
                    .get_for_scheme(route.asset.clone(), false)
                else {
                    return;
                };
                let Ok(body) = std::str::from_utf8(&asset.bytes) else {
                    return;
                };
                let rendered = render_route(body, &route.id);
                *response.status_mut() = tauri::http::StatusCode::OK;
                response
                    .headers_mut()
                    .remove(tauri::http::header::CONTENT_LENGTH);
                response.headers_mut().insert(
                    tauri::http::header::CONTENT_TYPE,
                    tauri::http::HeaderValue::from_str(if route.asset.ends_with(".txt") {
                        "text/x-component"
                    } else {
                        &asset.mime_type
                    })
                    .unwrap(),
                );
                response.headers_mut().insert(
                    tauri::http::header::CACHE_CONTROL,
                    tauri::http::HeaderValue::from_static("no-store"),
                );
                if let Some(csp) = asset.csp_header {
                    if let Ok(value) =
                        tauri::http::HeaderValue::from_str(&route_csp(body, &rendered, &csp))
                    {
                        response
                            .headers_mut()
                            .insert(tauri::http::header::CONTENT_SECURITY_POLICY, value);
                    }
                }
                *response.body_mut() = Cow::Owned(rendered.into_bytes());
            })
            .build()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn real_ids_resolve_only_existing_exported_html_and_rsc_routes() {
        let templates = vec![
            "dashboard/ventas/clientes/placeholder/editar/index.html".into(),
            "dashboard/ventas/clientes/placeholder/editar/index.txt".into(),
        ];
        let id = "4bae47a3-6003-456f-8614-861c38685ac5";
        let assets = templates.iter().cloned().collect();
        for path in [
            format!("/dashboard/ventas/clientes/{id}/editar/"),
            format!("/dashboard/ventas/clientes/{id}/editar"),
        ] {
            let route = resolve_route(&path, &templates, &assets).unwrap();
            assert_eq!(route.id, id);
            assert!(route.asset.ends_with("index.html"));
        }
        for path in [
            format!("/dashboard/ventas/clientes/{id}/editar/index.txt"),
            format!("/dashboard/ventas/clientes/{id}/editar.txt"),
        ] {
            assert!(resolve_route(&path, &templates, &assets)
                .unwrap()
                .asset
                .ends_with("index.txt"));
        }
        for path in [
            "/dashboard/ventas/clientes/../editar/",
            "/dashboard/ventas/clientes/%2fsecret/editar/",
            "/dashboard/ventas/clientes/<script>/editar/",
            "/api/ventas/clientes/example/editar/",
            "/dashboard/ventas/clientes/example/eliminar/",
        ] {
            assert!(resolve_route(path, &templates, &assets).is_none());
        }
    }

    #[test]
    fn exported_literal_routes_take_precedence_over_dynamic_html_and_rsc() {
        let templates = vec![
            "dashboard/compras/recepciones/placeholder/index.html".into(),
            "dashboard/compras/recepciones/placeholder/index.txt".into(),
        ];
        let mut assets: HashSet<String> = templates.iter().cloned().collect();
        assets.insert("dashboard/compras/recepciones/nueva/index.html".into());
        assets.insert("dashboard/compras/recepciones/nueva/index.txt".into());
        for path in [
            "/dashboard/compras/recepciones/nueva",
            "/dashboard/compras/recepciones/nueva/",
            "/dashboard/compras/recepciones/nueva/index.html",
            "/dashboard/compras/recepciones/nueva.txt",
            "/dashboard/compras/recepciones/nueva/index.txt",
        ] {
            assert!(resolve_route(path, &templates, &assets).is_none(), "{path}");
        }
        let id = "094f9e3c-9df7-40ea-a0cf-e5558650f63d";
        for path in [
            format!("/dashboard/compras/recepciones/{id}/"),
            format!("/dashboard/compras/recepciones/{id}/index.txt"),
        ] {
            let route = resolve_route(&path, &templates, &assets).unwrap();
            assert_eq!(route.id, id);
        }
    }

    #[test]
    fn route_substitution_preserves_input_placeholder_props_and_escaped_html() {
        let rsc = r#"{"c":["","dashboard","placeholder",""],"tree":["id","placeholder","d"],"props":{"placeholder":"Nombre","message":"placeholder"}}"#;
        let expected = r#"{"c":["","dashboard","real-id",""],"tree":["id","real-id","d"],"props":{"placeholder":"Nombre","message":"placeholder"}}"#;
        assert_eq!(render_route(rsc, "real-id"), expected);
        let html = serde_json::to_string(rsc).unwrap();
        assert_eq!(
            render_route(&html, "real-id"),
            serde_json::to_string(expected).unwrap()
        );
    }

    #[test]
    fn changed_route_script_keeps_csp_closed_with_its_new_content_hash() {
        let route_script = r#"self.__next_f.push([1,"[\"id\",\"placeholder\",\"d\"]"]);"#;
        let bootstrap = "window.bootstrap=true;";
        let html = format!("<script>{bootstrap}</script><script>{route_script}</script>");
        let rendered = render_route(&html, "real-id");
        let csp = format!(
            "default-src 'self'; script-src 'self' {} {}; connect-src 'self'",
            script_hash(bootstrap),
            script_hash(route_script)
        );
        let updated = route_csp(&html, &rendered, &csp);
        assert!(updated.contains(&script_hash(bootstrap)));
        assert!(!updated.contains(&script_hash(route_script)));
        assert!(updated.contains(&script_hash(inline_scripts(&rendered)[1])));
        assert!(!updated.contains("unsafe-inline"));
        assert_eq!(
            updated.split("; connect-src").nth(1),
            csp.split("; connect-src").nth(1)
        );
    }
}
