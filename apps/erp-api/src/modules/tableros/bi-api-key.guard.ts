import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";

const TOKEN = /^erpbi_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;

export function digestCredencialBi(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Primera barrera de la lectura BI: exige `Authorization: Bearer erpbi_…` con
 * el formato emitido y entrega sólo su hash. La base autentica ese hash contra
 * credenciales vigentes, autoriza el conjunto y registra cada acceso.
 */
@Injectable()
export class BiApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = /^Bearer\s+(\S+)$/i.exec(String(req.headers?.authorization ?? ""))?.[1] ?? "";
    if (!TOKEN.test(token)) throw new UnauthorizedException("Credencial de lectura inválida.");
    req.biTokenDigest = digestCredencialBi(token);
    return true;
  }
}
