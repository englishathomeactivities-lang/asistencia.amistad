module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const { SUPABASE_URL } = process.env;
  const supabasePublicKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !supabasePublicKey) {
    return res.status(500).json({ error: "Falta configurar Supabase en Vercel." });
  }

  return res.status(200).json({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: supabasePublicKey,
  });
};
