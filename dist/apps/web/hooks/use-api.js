'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useApi = useApi;
exports.useApiCall = useApiCall;
exports.useCpeApi = useCpeApi;
exports.useAuthApi = useAuthApi;
const react_1 = require("react");
const auth_helpers_nextjs_1 = require("@supabase/auth-helpers-nextjs");
const use_toast_1 = require("@/components/ui/use-toast");
function useApi(options = {}) {
    const [state, setState] = (0, react_1.useState)({
        success: false,
    });
    const supabase = (0, auth_helpers_nextjs_1.createClientComponentClient)();
    const { toast } = (0, use_toast_1.useToast)();
    const { showErrorToast = true, showSuccessToast = false } = options;
    const apiCall = (0, react_1.useCallback)(async (endpoint, options = {}) => {
        setState({ success: false, data: undefined });
        try {
            // Get current session for auth token
            const { data: { session } } = await supabase.auth.getSession();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            const url = `${apiUrl}${endpoint}`;
            console.log('🌐 API URL:', apiUrl);
            console.log('🔗 Full URL:', url);
            console.log('📦 Request Options:', options);
            // Default headers
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers,
            };
            // Add authorization header if session exists
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
                console.log('🔐 Auth token added');
            }
            else {
                console.log('⚠️ No auth token available');
            }
            console.log('📡 Making request...');
            const response = await fetch(url, {
                ...options,
                headers,
                mode: 'cors', // Explicitly set CORS mode
            });
            console.log('📨 Response status:', response.status);
            console.log('📨 Response ok:', response.ok);
            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ HTTP Error Response:', errorText);
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            const result = await response.json();
            console.log('✅ Response data:', result);
            // Verificar success en el nivel correcto
            // Si la respuesta es exitosa (status 200-299) y tiene data, considerarla válida
            const hasData = result.id || result.data || Array.isArray(result);
            const success = result.success === true || result.success === 'true' || hasData;
            if (!success && result.error) {
                console.error('❌ API response indicates failure:', result);
                throw new Error(result.message || result.error || 'API call failed');
            }
            // Para el estado interno, guardamos los datos
            const responseData = result.data !== undefined ? result.data : result;
            setState({ success: true, data: responseData });
            if (showSuccessToast) {
                toast({
                    title: "Éxito",
                    description: result.message || "Operación completada exitosamente",
                });
            }
            // IMPORTANTE: Devolver el objeto completo con success para que el frontend pueda verificarlo
            return result;
        }
        catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error('❌ API call failed:', err);
            console.error('❌ Error message:', errorMessage);
            console.error('❌ Full error object:', err);
            setState({ success: false, data: undefined });
            if (showErrorToast) {
                toast({
                    variant: "destructive",
                    title: "Error de API",
                    description: errorMessage,
                });
            }
            return null;
        }
    }, [supabase, toast, showErrorToast, showSuccessToast]);
    // Helper methods for different HTTP methods
    const get = (0, react_1.useCallback)((endpoint) => {
        return apiCall(endpoint, { method: 'GET' });
    }, [apiCall]);
    const post = (0, react_1.useCallback)((endpoint, data) => {
        console.log('📤 POST request to:', endpoint, 'with data:', data);
        return apiCall(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    }, [apiCall]);
    const put = (0, react_1.useCallback)((endpoint, data) => {
        return apiCall(endpoint, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
        });
    }, [apiCall]);
    const del = (0, react_1.useCallback)((endpoint) => {
        return apiCall(endpoint, { method: 'DELETE' });
    }, [apiCall]);
    return {
        ...state,
        get,
        post,
        put,
        delete: del,
        request: apiCall,
    };
}
// Specific hooks for common operations
function useApiCall() {
    return useApi();
}
function useCpeApi() {
    return useApi({
        showErrorToast: true,
        showSuccessToast: true,
    });
}
function useAuthApi() {
    return useApi({
        showErrorToast: true,
        showSuccessToast: false,
    });
}
