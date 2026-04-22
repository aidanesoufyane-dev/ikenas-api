/**
 * Controller Dashboard - Statistiques pour l'admin
 */
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const LeaveRequest = require('../models/LeaveRequest');
const { asyncHandler } = require('../utils/helpers');

/**
 * @desc    Obtenir les statistiques du dashboard admin
 * @route   GET /api/dashboard/stats
 * @access  Private/Admin
 */
const getStats = asyncHandler(async (req, res) => {
  // Exécuter toutes les requêtes en parallèle pour la performance
  const [
    totalStudents,
    totalTeachers,
    totalClasses,
    pendingAttendances,
    pendingLeaveAbsenceRequests,
    pendingLeaveReturnRequests,
    pendingStudentJustifications,
  ] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    Class.countDocuments({ isActive: true }),
    Attendance.countDocuments({ approvalStatus: 'pending' }),
    LeaveRequest.countDocuments({ requestType: 'absence', status: 'pending' }),
    LeaveRequest.countDocuments({ requestType: 'return', status: 'pending' }),
    Attendance.countDocuments({
      justifiedByStudent: true,
      approvalStatus: 'pending',
      status: { $in: ['absent', 'excused', 'late'] },
    }),
  ]);

  // Statistiques par classe (nombre d'absences par classe)
  const absencesByClass = await Attendance.aggregate([
    {
      $match: {
        status: { $in: ['absent', 'excused'] },
      },
    },
    {
      $group: {
        _id: '$classe',
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'classes',
        localField: '_id',
        foreignField: '_id',
        as: 'classInfo',
      },
    },
    {
      $unwind: '$classInfo',
    },
    {
      $project: {
        className: '$classInfo.name',
        count: 1,
      },
    },
    {
      $sort: { count: -1, className: 1 },
    },
  ]);

  const pendingAttendancesByClass = await Attendance.aggregate([
    {
      $match: {
        approvalStatus: 'pending',
        classe: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$classe',
        pendingCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'classes',
        localField: '_id',
        foreignField: '_id',
        as: 'classInfo',
      },
    },
    {
      $unwind: '$classInfo',
    },
    {
      $project: {
        classId: '$classInfo._id',
        className: '$classInfo.name',
        pendingCount: 1,
      },
    },
    {
      $sort: { pendingCount: -1, className: 1 },
    },
  ]);

  const approvalQueueCount = pendingAttendances + pendingLeaveAbsenceRequests + pendingLeaveReturnRequests;

  const priorityAlerts = [
    {
      key: 'leave_absence',
      label: 'Demandes d\'absence à valider',
      count: pendingLeaveAbsenceRequests,
      path: '/admin/teachers/leave-requests',
    },
    {
      key: 'leave_return',
      label: 'Demandes de reprise à valider',
      count: pendingLeaveReturnRequests,
      path: '/admin/teachers/leave-requests',
    },
    {
      key: 'student_justification',
      label: 'Justifications d\'absence élève en attente',
      count: pendingStudentJustifications,
      path: '/admin/attendances',
    },
    {
      key: 'attendance_approval',
      label: 'Absences / présences à approuver',
      count: pendingAttendances,
      path: '/admin/attendances',
    },
  ];

  res.status(200).json({
    success: true,
    data: {
      totalStudents,
      totalTeachers,
      totalClasses,
      pendingAttendances,
      approvalQueueCount,
      pendingLeaveAbsenceRequests,
      pendingLeaveReturnRequests,
      pendingStudentJustifications,
      absencesByClass,
      pendingAttendancesByClass,
      priorityAlerts,
    },
  });
});

module.exports = {
  getStats,
};

// @desc    Respond to an event or news
// @route   POST /api/news/:id/respond
const respondToNews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { response } = req.body;
  const News = require('../models/News');
  const newsItem = await News.findById(id);
  if (!newsItem) return res.status(404).json({ success: false, message: 'News not found' });
  
  if (!newsItem.responses) newsItem.responses = [];
  const existingResponseIdx = newsItem.responses.findIndex(r => String(r.user) === String(req.user.id));
  if (existingResponseIdx >= 0) {
    newsItem.responses[existingResponseIdx].response = response;
    newsItem.responses[existingResponseIdx].date = Date.now();
  } else {
    newsItem.responses.push({ user: req.user.id, response, date: Date.now() });
  }
  await newsItem.save();
  res.status(200).json({ success: true, data: newsItem });
});

// @desc    Obtenir les statistiques d'une classe pour le Dashboard Prof
// @route   GET /api/dashboard/teacher/class-stats
const getClassStats = asyncHandler(async (req, res) => {
  const { classeId } = req.query;
  const NoteEntry = require('../models/NoteEntry');
  const ExamResult = require('../models/ExamResult');
  const Student = require('../models/Student');
  
  if (!classeId) {
    return res.status(400).json({ success: false, message: 'Class ID is required.' });
  }

  // 1. Fetch Students
  const students = await Student.find({ classe: classeId }).select('_id');
  const studentIds = students.map(s => s._id);

  // 2. Fetch NoteEntries & ExamResults
  const [noteEntries, examResults] = await Promise.all([
    NoteEntry.find({ student: { $in: studentIds } }),
    ExamResult.find({ student: { $in: studentIds } })
  ]);

  // 3. Process & Merge
  let totalScore = 0;
  let validScoresCount = 0;
  let evolutionData = [];

  const processEntry = (entry) => {
    let score = null;
    let maxSc = entry.maxScore || 20;

    if (entry.score !== null && entry.score !== undefined) {
      score = Number(entry.score);
    } else if (entry.components && entry.components.length > 0) {
      // average components
      const validComponents = entry.components.filter(c => c.score !== null && c.score !== undefined);
      if (validComponents.length > 0) {
        score = validComponents.reduce((sum, c) => sum + Number(c.score), 0);
      }
    }

    if (score !== null) {
      // Normalize to 20
      const normalizedScore = (score / maxSc) * 20;
      totalScore += normalizedScore;
      validScoresCount++;

      evolutionData.push({
        date: entry.createdAt || entry.date || Date.now(),
        score: normalizedScore
      });
    }
  };

  noteEntries.forEach(processEntry);
  examResults.forEach(processEntry);

  const averageScore = validScoresCount > 0 ? (totalScore / validScoresCount).toFixed(2) : '--';

  // Sort Evolution Chronologically and group (very basic grouping)
  evolutionData.sort((a, b) => new Date(a.date) - new Date(b.date));
  let evolution = evolutionData.map((e, index) => ({
    x: index,
    y: Number(e.score.toFixed(2))
  }));

  if (evolution.length === 0) {
    evolution.push({ x: 0, y: 0 }); // Fallback
  }

  res.status(200).json({
    success: true,
    data: {
      averageScore,
      totalGrades: validScoresCount,
      evolution: evolution
    }
  });
});

module.exports = { getStats, getClassStats };
