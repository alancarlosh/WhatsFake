function resolveApiUrl() {
    const env = import.meta.env;
    const viteUrl = env?.VITE_API_URL ?? env?.EXPO_PUBLIC_API_URL;
    if (viteUrl) {
        return viteUrl;
    }
    const runtime = globalThis;
    return runtime.process?.env?.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
}
export async function loginWithCredentials(username, password) {
    const baseUrl = resolveApiUrl();
    let response;
    try {
        response = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
    }
    catch {
        throw new Error('No se pudo conectar con el backend. Verifica URL, puerto y CORS.');
    }
    if (!response.ok) {
        const raw = await response.text();
        try {
            const parsed = JSON.parse(raw);
            throw new Error(parsed.message ?? parsed.error ?? `Error de login (${response.status})`);
        }
        catch {
            throw new Error(raw || `Error de login (${response.status})`);
        }
    }
    return response.json();
}
