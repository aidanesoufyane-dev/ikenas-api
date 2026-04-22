const fs = require('fs');

let dashPath = 'backend-demo/controllers/dashboardController.js';
let dashRoutesPath = 'backend-demo/routes/dashboardRoutes.js';
let dashCode = fs.readFileSync(dashPath, 'utf8');

dashCode = dashCode.replace(/module\.exports = \{.*?\};\s*/s, '');
dashCode += "\n\nconst getClassStats = require('../utils/helpers').asyncHandler(async (req, res) => {\n" +
"  const { classeId } = req.query;\n" +
"  const NoteEntry = require('../models/NoteEntry');\n" +
"  const ExamResult = require('../models/ExamResult');\n" +
"  const Student = require('../models/Student');\n" +
"  if (!classeId) return res.status(400).json({ success: false, message: 'Class ID is required.' });\n" +
"  const students = await Student.find({ classe: classeId }).select('_id');\n" +
"  const studentIds = students.map(s => s._id);\n" +
"  const [noteEntries, examResults] = await Promise.all([\n" +
"    NoteEntry.find({ student: { backend-demo/apply-fixes.jsin: studentIds } }),\n" +
"    ExamResult.find({ student: { backend-demo/apply-fixes.jsin: studentIds } })\n" +
"  ]);\n" +
"  let totalScore = 0;\n" +
"  let validScoresCount = 0;\n" +
"  let evolutionData = [];\n" +
"  const processEntry = (entry) => {\n" +
"    let score = null;\n" +
"    let maxSc = entry.maxScore || 20;\n" +
"    if (entry.score !== null && entry.score !== undefined) {\n" +
"      score = Number(entry.score);\n" +
"    } else if (entry.components && entry.components.length > 0) {\n" +
"      const validComponents = entry.components.filter(c => c.score !== null && c.score !== undefined);\n" +
"      if (validComponents.length > 0) score = validComponents.reduce((sum, c) => sum + Number(c.score), 0);\n" +
"    }\n" +
"    if (score !== null) {\n" +
"      const normalizedScore = (score / maxSc) * 20;\n" +
"      totalScore += normalizedScore;\n" +
"      validScoresCount++;\n" +
"      evolutionData.push({ date: entry.createdAt || entry.date || Date.now(), score: normalizedScore });\n" +
"    }\n" +
"  };\n" +
"  noteEntries.forEach(processEntry);\n" +
"  examResults.forEach(processEntry);\n" +
"  const averageScore = validScoresCount > 0 ? (totalScore / validScoresCount).toFixed(2) : '--';\n" +
"  evolutionData.sort((a, b) => new Date(a.date) - new Date(b.date));\n" +
"  let evolution = evolutionData.map((e, index) => ({ x: index, y: Number(e.score.toFixed(2)) }));\n" +
"  if (evolution.length === 0) evolution.push({ x: 0, y: 0 });\n" +
"  res.status(200).json({ success: true, data: { average: averageScore, totalGrades: validScoresCount, evolution } });\n" +
"});\n\n" +
"module.exports = { getStats: module.exports.getStats || dashboardCodeHack, getClassStats };\n";

// Hack to keep getStats valid (regex clears module exports so we reconstruct it correctly based on original file)
dashCode = fs.readFileSync(dashPath, 'utf8').replace(/module\.exports = {([\s\S]*?)};/, '') + 
"module.exports = { getStats, getClassStats };";
fs.writeFileSync(dashPath, dashCode);

fs.writeFileSync(dashRoutesPath, fs.readFileSync(dashRoutesPath, 'utf8').replace(/router\.get\('\/stats'/, "router.get('/class-stats', protect, getClassStats);\nrouter.get('/stats'").replace(/const \{ getStats \} =/, 'const { getStats, getClassStats } ='));


let authPath = 'backend-demo/controllers/authController.js';
let authCode = fs.readFileSync(authPath, 'utf8').replace(/module\.exports = \{.*?\};\s*/s, '') + 
"\n\nconst updateProfile = require('../utils/helpers').asyncHandler(async (req, res) => {\n" +
"  const User = require('../models/User');\n" +
"  const { name, email, phone, avatarIndex } = req.body;\n" +
"  const user = await User.findById(req.user.id);\n" +
"  if (name) { const parts = name.split(' '); user.firstName = parts[0]; user.lastName = parts.slice(1).join(' '); }\n" +
"  if (email !== undefined) user.email = email;\n" +
"  if (phone !== undefined) user.phone = phone;\n" +
"  if (avatarIndex !== undefined) user.avatarIndex = avatarIndex;\n" +
"  await user.save(); res.status(200).json({ success: true, data: user });\n" +
"});\n\n" +
"const updateFcmToken = require('../utils/helpers').asyncHandler(async (req, res) => {\n" +
"  const User = require('../models/User');\n" +
"  const { fcmToken } = req.body;\n" +
"  const user = await User.findById(req.user.id);\n" +
"  if (fcmToken) {\n" +
"    if (!user.fcmTokens) user.fcmTokens = [];\n" +
"    if (!user.fcmTokens.includes(fcmToken)) {\n" +
"      user.fcmTokens.push(fcmToken);\n" +
"      await user.save();\n" +
"    }\n" +
"  }\n" +
"  res.status(200).json({ success: true, message: 'Token updated' });\n" +
"});\n\n" +
"module.exports = { login, register, getMe, updatePassword, updateProfile, updateFcmToken };\n";
fs.writeFileSync(authPath, authCode);

let authRoutesPath = 'backend-demo/routes/authRoutes.js';
let authRoutesCode = fs.readFileSync(authRoutesPath, 'utf8');
authRoutesCode = authRoutesCode.replace(/(module\.exports = router;)/, "router.put('/profile', protect, updateProfile);\nrouter.post('/fcm-token', protect, updateFcmToken);\n\");
authRoutesCode = authRoutesCode.replace(/const \{.*?\} = require\('\.\.\/controllers\/authController'\);/, "const { login, register, getMe, updatePassword, updateProfile, updateFcmToken } = require('../controllers/authController');");
fs.writeFileSync(authRoutesPath, authRoutesCode);

console.log('Applied');
