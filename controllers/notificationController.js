/**
 * Controller Notifications - CRUD + mark as read
 */
const Notification = require('../models/Notification');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const { asyncHandler } = require('../utils/helpers');

/**
 * @desc    Récupérer les notifications de l'utilisateur connecté
 * @route   GET /api/notifications?unread=true&limit=30
 * @access  Private
 */
const getMyNotifications = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;
  const limit = parseInt(req.query.limit) || 30;
  const unreadOnly = req.query.unread === 'true';

  // Déterminer la classe de l'élève
  let classeId = null;
  if (role === 'student') {
    const student = await Student.findOne({ user: userId });
    if (student) classeId = student.classe;
  }

  // Déterminer les classes du prof
  let teacherClassIds = [];
  if (role === 'teacher') {
    const teacher = await Teacher.findOne({ user: userId });
    if (teacher) teacherClassIds = teacher.classes.map((c) => c.toString());
  }

  // Construire le filtre OR : broadcast OU par rôle OU par classe OU personnelle
  const orConditions = [
    // Broadcast global (pas de recipient, pas de rôle, pas de classe)
    { recipient: null, recipientRole: null, recipientClass: null },
    // Par rôle
    { recipientRole: role },
    // Personnelle (directement pour cet utilisateur)
    { recipient: userId },
  ];

  // Par classe
  if (classeId) {
    orConditions.push({ recipientClass: classeId });
  }
  if (teacherClassIds.length > 0) {
    orConditions.push({ recipientClass: { $in: teacherClassIds } });
  }

  const filter = { $or: orConditions };

  if (unreadOnly) {
    filter.readBy = { $ne: userId };
  }

  const notifications = await Notification.find(filter)
    .populate('createdBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .limit(limit);

  // Compter les non lues
  const unreadFilter = { $or: orConditions, readBy: { $ne: userId } };
  const unreadCount = await Notification.countDocuments(unreadFilter);

  res.status(200).json({
    success: true,
    data: notifications,
    unreadCount,
  });
});

/**
 * @desc    Marquer des notifications comme lues
 * @route   PUT /api/notifications/read
 * @access  Private
 * @body    { ids: [...] } ou {} pour tout marquer comme lu
 */
const markAsRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const ids = req.body.ids || (req.body.id ? [req.body.id] : []);

  if (ids && Array.isArray(ids) && ids.length > 0) {
    await Notification.updateMany(
      { _id: { $in: ids } },
      { $addToSet: { readBy: userId } }
    );
  } else {
    // Marquer toutes comme lues
    await Notification.updateMany(
      { readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );
  }

  res.status(200).json({ success: true, message: 'Notifications marquées comme lues.' });
});

/**
 * @desc    Compter les notifications non lues
 * @route   GET /api/notifications/unread-count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let classeId = null;
  if (role === 'student') {
    const student = await Student.findOne({ user: userId });
    if (student) classeId = student.classe;
  }

  let teacherClassIds = [];
  if (role === 'teacher') {
    const teacher = await Teacher.findOne({ user: userId });
    if (teacher) teacherClassIds = teacher.classes.map((c) => c.toString());
  }

  const orConditions = [
    { recipient: null, recipientRole: null, recipientClass: null },
    { recipientRole: role },
    { recipient: userId },
  ];
  if (classeId) orConditions.push({ recipientClass: classeId });
  if (teacherClassIds.length > 0) orConditions.push({ recipientClass: { $in: teacherClassIds } });

  const unreadCount = await Notification.countDocuments({
    $or: orConditions,
    readBy: { $ne: userId },
  });

  res.status(200).json({ success: true, unreadCount });
});

// @desc    Delete a specific notification
// @route   DELETE /api/notifications/:id
const deleteNotification = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    return res.status(404).json({ success: false, message: 'Notification not found' });
  }

  if (req.user.role === 'admin' || String(notification.recipient) === String(req.user.id)) {
    await notification.deleteOne();
    return res.status(200).json({ success: true, data: {} });
  } else {
    if (!notification.hiddenBy) notification.hiddenBy = [];
    notification.hiddenBy.push(req.user.id);
    await notification.save();
    return res.status(200).json({ success: true, data: {} });
  }
});

// @desc    Clear all notifications for the user
// @route   DELETE /api/notifications
const clearNotifications = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { hiddenBy: { $ne: req.user.id } },
    { $addToSet: { hiddenBy: req.user.id } }
  );
  await Notification.deleteMany({ recipient: req.user.id });
  res.status(200).json({ success: true, data: {} });
});

module.exports = {
  getMyNotifications,
  markAsRead,
  getUnreadCount,
  deleteNotification,
  clearNotifications,
};
