const { createHmac, timingSafeEqual } = require("node:crypto");

const SUBJECTS = new Set([
  "Informática",
  "Ética",
  "Inglés",
  "Proyecto Lector",
]);
const TEACHER_EMAIL = "englishathomeactivities@gmail.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supabasePublicKey = () => process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function supabase(path, token, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: supabasePublicKey(),
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    fail(502, "Supabase devolvió una respuesta no válida.");
  }

  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 403 : 502;
    fail(status, data && data.message ? data.message : "No se pudo completar la operación en Supabase.");
  }
  return data;
}

function signedQr(studentId) {
  const signature = createHmac("sha256", process.env.QR_SECRET)
    .update(`LAAM|${studentId}`)
    .digest("base64url");
  return `LAAM|${studentId}|${signature}`;
}

function validQr(value) {
  if (typeof value !== "string") return null;
  const match = /^LAAM\|([0-9a-f-]{36})\|([A-Za-z0-9_-]{43})$/i.exec(value);
  if (!match || !UUID.test(match[1])) return null;

  const expected = Buffer.from(signedQr(match[1]).split("|")[2]);
  const received = Buffer.from(match[2]);
  return expected.length === received.length && timingSafeEqual(expected, received)
    ? match[1]
    : null;
}

function todayInBogota() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function periodFor(date, periods) {
  const period = Array.isArray(periods)
    ? periods.find((item) => item && date >= item.start && date <= item.end)
    : null;
  return period ? period.period : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido." });
  }

  if (!process.env.SUPABASE_URL || !supabasePublicKey() || !process.env.QR_SECRET) {
    return res.status(500).json({ error: "Falta configurar Supabase o la firma de QR en Vercel." });
  }

  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) fail(401, "Inicia sesión para usar los códigos QR.");

    const user = await supabase("/auth/v1/user", token);
    if (typeof user.email !== "string" || user.email.toLowerCase() !== TEACHER_EMAIL) {
      fail(403, "Este sistema está habilitado únicamente para englishathomeactivities@gmail.com.");
    }
    const profiles = await supabase(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
      token,
    );
    if (!profiles || profiles[0]?.role !== "teacher") {
      fail(403, "Solo los docentes autorizados pueden usar los códigos QR.");
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action === "issue") {
      const ids = body.studentIds;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
          ids.some((id) => typeof id !== "string" || !UUID.test(id))) {
        fail(400, "La lista de estudiantes no es válida.");
      }
      const query = new URLSearchParams({
        select: "id",
        id: `in.(${ids.join(",")})`,
      });
      const students = await supabase(`/rest/v1/students?${query}`, token);
      const allowed = new Set(students.map((student) => student.id));
      if (allowed.size !== new Set(ids).size) fail(404, "Uno o más estudiantes no existen.");

      return res.status(200).json({
        tokens: Object.fromEntries(ids.map((id) => [id, signedQr(id)])),
      });
    }

    if (body.action === "mark") {
      if (!SUBJECTS.has(body.subject)) fail(400, "Selecciona una materia válida.");
      const studentId = validQr(body.qr);
      if (!studentId) fail(400, "El código QR no es válido.");

      const studentQuery = new URLSearchParams({
        select: "id,name,grade,year",
        id: `eq.${studentId}`,
        limit: "1",
      });
      const students = await supabase(`/rest/v1/students?${studentQuery}`, token);
      const student = students[0];
      if (!student) fail(404, "El estudiante del código no existe.");

      const date = todayInBogota();
      const classId = body.classId === undefined ? "general" : body.classId;
      if (typeof classId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(classId)) {
        fail(400, "La clase seleccionada no es válida.");
      }
      const year = Number(date.slice(0, 4));
      const settingsQuery = new URLSearchParams({
        select: "periods,schedule",
        year: `eq.${year}`,
        limit: "1",
      });
      const settings = await supabase(`/rest/v1/school_year_settings?${settingsQuery}`, token);
      const yearSettings = settings[0] || {};
      if (classId !== "general") {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        const scheduledClass = Array.isArray(yearSettings.schedule)
          ? yearSettings.schedule.find((item) => item && item.id === classId)
          : null;
        if (!scheduledClass || scheduledClass.subject !== body.subject ||
            !Array.isArray(scheduledClass.grades) || !scheduledClass.grades.includes(student.grade) ||
            scheduledClass.day !== weekday) {
          fail(400, "La clase seleccionada no corresponde al horario de hoy para este estudiante.");
        }
      }
      const attendanceQuery = new URLSearchParams({
        select: "id,status",
        student_id: `eq.${studentId}`,
        subject: `eq.${body.subject}`,
        date: `eq.${date}`,
        class_id: `eq.${classId}`,
        limit: "1",
      });
      const existing = await supabase(`/rest/v1/attendance?${attendanceQuery}`, token);
      if (existing[0]?.status === "A") {
        return res.status(200).json({ duplicate: true, student });
      }

      const period = periodFor(date, yearSettings.periods);
      const rows = await supabase(
        "/rest/v1/attendance?on_conflict=student_id%2Csubject%2Cdate%2Cclass_id",
        token,
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify([{
            student_id: studentId,
            subject: body.subject,
            date,
            year: student.year,
            period,
            class_id: classId,
            status: "A",
          }]),
        },
      );
      return res.status(200).json({ duplicate: false, student, attendance: rows[0] });
    }

    fail(400, "La operación QR no es válida.");
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status === 500) console.error("Error en /api/qr:", error);
    return res.status(status).json({
      error: status === 500 ? "No se pudo procesar el código QR." : error.message,
    });
  }
};
