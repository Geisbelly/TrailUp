// Testes nunca devem herdar credenciais reais do .env local.
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_KEY = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.GEMINI_API_KEY = "";
process.env.API_SHARED_SECRET = "";
