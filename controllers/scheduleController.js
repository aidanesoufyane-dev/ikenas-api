/**
 * Controller Emploi du Temps - CRUD et vues spécifiques par rôle
 */
const Schedule = require('../models/Schedule');
const ScheduleSettings = require('../models/ScheduleSettings');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const { asyncHandler } = require('../utils/helpers');

const DEFAULT_SCHEDULE_CONFIG = {
  morningStart: '08:00',
  morningEnd: '12:00',
  afternoonStart: '14:00',
  afternoonEnd: '18:00',
  sessionDuration: 60,
  breaks: [],
};

const normalizeDateToStart = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
};

const normalizeDateToEnd = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(23, 59, 59, 999);
  return date;
};

const timeToMin = (value) => {
  const [hours, minutes] = String(value || '00:00').split(':').map(Number);
  return (hours * 60) + minutes;
};

const minToTime = (value) => {
  const safeValue = Math.max(0, Math.round(Number(value) || 0));
  const hours = String(Math.floor(safeValue / 60)).padStart(2, '0');
  const minutes = String(safeValue % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const applySessionCap = (config = {}) => {
  const merged = {
    ...DEFAULT_SCHEDULE_CONFIG,
    ...config,
    breaks: Array.isArray(config.breaks) ? config.breaks : [],
  };

  const sessionDuration = Number(merged.sessionDuration) || 60;
  const maxHalfDayMinutes = sessionDuration * 4;

  const morningStartMin = timeToMin(merged.morningStart);
  const afternoonStartMin = timeToMin(merged.afternoonStart);
  const morningEndCap = morningStartMin + maxHalfDayMinutes;
  const afternoonEndCap = afternoonStartMin + maxHalfDayMinutes;

  const requestedMorningEnd = timeToMin(merged.morningEnd);
  const requestedAfternoonEnd = timeToMin(merged.afternoonEnd);

  return {
    ...merged,
    sessionDuration,
    morningEnd: minToTime(Math.min(requestedMorningEnd, morningEndCap)),
    afternoonEnd: minToTime(Math.min(requestedAfternoonEnd, afternoonEndCap)),
  };
};

const resolveEffectiveConfig = (settingsDoc, referenceDate = new Date()) => {
  const baseConfig = applySessionCap(settingsDoc?.defaultConfig || DEFAULT_SCHEDULE_CONFIG);
  const exceptions = settingsDoc?.exceptions || [];

  const activeException = exceptions.find((exception) => {
    if (!exception.isActive) return false;
    const from = normalizeDateToStart(exception.startDate);
    const to = normalizeDateToEnd(exception.endDate);
    return referenceDate >= from && referenceDate <= to;
  });

  if (!activeException) {
    return { profile: 'default', config: baseConfig, activeException: null };
  }

  return {
    profile: 'exception',
    config: applySessionCap({
      morningStart: activeException.morningStart,
      morningEnd: activeException.morningEnd,
      afternoonStart: activeException.afternoonStart,
      afternoonEnd: activeException.afternoonEnd,
      sessionDuration: activeException.sessionDuration,
      breaks: activeException.breaks || [],
    }),
    activeException,
  };
};

const getOrCreateSettings = async () => {
  let settings = await ScheduleSettings.findOne({});
  if (!settings) {
    settings = await ScheduleSettings.create({ defaultConfig: DEFAULT_SCHEDULE_CONFIG, exceptions: [] });
  }
  return settings;
};

const validateSlotBySettings = async (startTime, endTime) => {
  const settings = await getOrCreateSettings();
  const { config } = resolveEffectiveConfig(settings);

  const start = timeToMin(startTime);
  const end = timeToMin(endTime);
  const morningStart = timeToMin(config.morningStart);
  const morningEnd = timeToMin(config.morningEnd);
  const afternoonStart = timeToMin(config.afternoonStart);
  const afternoonEnd = timeToMin(config.afternoonEnd);
  const duration = end - start;

  if (end <= start) {
    const error = new Error("L'heure de fin doit être après l'heure de début.");
    error.statusCode = 400;
    throw error;
  }

  const insideMorning = start >= morningStart && end <= morningEnd;
  const insideAfternoon = start >= afternoonStart && end <= afternoonEnd;

  if (!insideMorning && !insideAfternoon) {
    const error = new Error('Le créneau doit être dans la plage du matin ou de l\'après-midi définie dans les paramètres.');
    error.statusCode = 400;
    throw error;
  }

  const sessionDuration = Number(config.sessionDuration) || 60;
  if (duration % sessionDuration !== 0) {
    const error = new Error(`La durée du créneau doit être un multiple de ${sessionDuration} minutes.`);
    error.statusCode = 400;
    throw error;
  }

  const configuredBreaks = (config.breaks || []).filter((item) => item?.startTime && item?.endTime);
  const overlapsBreak = configuredBreaks.some((item) => {
    const breakStart = timeToMin(item.startTime);
    const breakEnd = timeToMin(item.endTime);
    return start < breakEnd && end > breakStart;
  });

  if (overlapsBreak) {
    const error = new Error('Le créneau chevauche une pause configurée.');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * @desc    Créer un créneau d'emploi du temps
 * @route   POST /api/schedules
 * @access  Private/Admin
 */
const createSchedule = asyncHandler(async (req, res) => {
  const { day, startTime, endTime, classe, teacher, room } = req.body;

  await validateSlotBySettings(startTime, endTime);

  // Détection de conflits horaires
  const conflicts = await Schedule.find({
    day,
    isActive: true,
    $or: [
      // Même prof au même créneau
      {
        teacher,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      },
      // Même classe au même créneau
      {
        classe,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      },
      // Même salle au même créneau
      {
        room,
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      },
    ],
  })
    .populate('classe', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
    .populate('subject', 'name code');

  if (conflicts.length > 0) {
    const messages = conflicts.map((c) => {
      if (c.teacher?._id?.toString() === teacher) return `Prof déjà occupé (${c.startTime}-${c.endTime}, ${c.classe?.name})`;
      if (c.classe?._id?.toString() === classe) return `Classe déjà occupée (${c.startTime}-${c.endTime}, ${c.subject?.name})`;
      if (c.room === room) return `Salle "${room}" déjà occupée (${c.startTime}-${c.endTime})`;
      return 'Conflit horaire détecté.';
    });
    return res.status(409).json({
      success: false,
      message: 'Conflit(s) horaire(s) détecté(s) :',
      conflicts: messages,
    });
  }

  const schedule = await Schedule.create(req.body);

  const populated = await Schedule.findById(schedule._id)
    .populate('classe', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
    .populate('subject', 'name code');

  res.status(201).json({ success: true, data: populated });
});

/**
 * @desc    Lister tous les créneaux
 * @route   GET /api/schedules?classe=&teacher=&day=
 * @access  Private
 */
const getSchedules = asyncHandler(async (req, res) => {
  const filter = { isActive: true };

  if (req.query.classe) filter.classe = req.query.classe;
  if (req.query.teacher) filter.teacher = req.query.teacher;
  if (req.query.day) filter.day = req.query.day;

  const schedules = await Schedule.find(filter)
    .populate('classe', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
    .populate('subject', 'name code')
    .sort({ day: 1, startTime: 1 });

  res.status(200).json({ success: true, data: schedules });
});

/**
 * @desc    Emploi du temps spécifique d'un professeur (vue prof)
 * @route   GET /api/schedules/my-schedule
 * @access  Private/Teacher
 */
const getMyScheduleTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ user: req.user.id });
  if (!teacher) {
    return res.status(404).json({ success: false, message: 'Profil enseignant non trouvé.' });
  }

  const schedules = await Schedule.find({ teacher: teacher._id, isActive: true })
    .populate('classe', 'name')
    .populate('subject', 'name code')
    .sort({ day: 1, startTime: 1 });

  // Organiser par jour pour la vue calendrier
  const byDay = {};
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  days.forEach((d) => (byDay[d] = []));
  schedules.forEach((s) => byDay[s.day].push(s));

  res.status(200).json({ success: true, data: schedules, byDay });
});

/**
 * @desc    Emploi du temps spécifique d'un élève (vue étudiant)
 * @route   GET /api/schedules/my-schedule-student
 * @access  Private/Student
 */
const getMyScheduleStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user.id });
  if (!student) {
    return res.status(404).json({ success: false, message: 'Profil étudiant non trouvé.' });
  }

  const schedules = await Schedule.find({ classe: student.classe, isActive: true })
    .populate('classe', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
    .populate('subject', 'name code')
    .sort({ day: 1, startTime: 1 });

  // Organiser par jour
  const byDay = {};
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  days.forEach((d) => (byDay[d] = []));
  schedules.forEach((s) => byDay[s.day].push(s));

  res.status(200).json({ success: true, data: schedules, byDay });
});

/**
 * @desc    Mettre à jour un créneau
 * @route   PUT /api/schedules/:id
 * @access  Private/Admin
 */
const updateSchedule = asyncHandler(async (req, res) => {
  const { day, startTime, endTime, classe, teacher, room } = req.body;

  const existing = await Schedule.findById(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Créneau non trouvé.' });
  }

  const targetStartTime = startTime || existing.startTime;
  const targetEndTime = endTime || existing.endTime;
  await validateSlotBySettings(targetStartTime, targetEndTime);

  // Détection de conflits (en excluant le créneau actuel)
  if (day && startTime && endTime) {
    const conflicts = await Schedule.find({
      _id: { $ne: req.params.id },
      day,
      isActive: true,
      $or: [
        ...(teacher ? [{ teacher, startTime: { $lt: endTime }, endTime: { $gt: startTime } }] : []),
        ...(classe ? [{ classe, startTime: { $lt: endTime }, endTime: { $gt: startTime } }] : []),
        ...(room ? [{ room, startTime: { $lt: endTime }, endTime: { $gt: startTime } }] : []),
      ],
    })
      .populate('classe', 'name')
      .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
      .populate('subject', 'name code');

    if (conflicts.length > 0) {
      const messages = conflicts.map((c) => {
        if (teacher && c.teacher?._id?.toString() === teacher) return `Prof déjà occupé (${c.startTime}-${c.endTime}, ${c.classe?.name})`;
        if (classe && c.classe?._id?.toString() === classe) return `Classe déjà occupée (${c.startTime}-${c.endTime})`;
        if (room && c.room === room) return `Salle "${room}" déjà occupée (${c.startTime}-${c.endTime})`;
        return 'Conflit horaire détecté.';
      });
      return res.status(409).json({
        success: false,
        message: 'Conflit(s) horaire(s) détecté(s) :',
        conflicts: messages,
      });
    }
  }

  const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate('classe', 'name')
    .populate({ path: 'teacher', populate: { path: 'user', select: 'firstName lastName' } })
    .populate('subject', 'name code');
  res.status(200).json({ success: true, data: schedule });
});

/**
 * @desc    Supprimer un créneau
 * @route   DELETE /api/schedules/:id
 * @access  Private/Admin
 */
const deleteSchedule = asyncHandler(async (req, res) => {
  const schedule = await Schedule.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!schedule) {
    return res.status(404).json({ success: false, message: 'Créneau non trouvé.' });
  }

  res.status(200).json({ success: true, message: 'Créneau supprimé avec succès.' });
});

/**
 * @desc    Obtenir les paramètres d'emploi du temps (généraux + exceptions)
 * @route   GET /api/schedules/settings
 * @access  Private
 */
const getScheduleSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings();
  const effective = resolveEffectiveConfig(settings);

  res.status(200).json({
    success: true,
    data: {
      defaultConfig: settings.defaultConfig,
      exceptions: settings.exceptions,
      effectiveConfig: effective.config,
      activeProfile: effective.profile,
      activeException: effective.activeException,
    },
  });
});

/**
 * @desc    Mettre à jour les paramètres d'emploi du temps
 * @route   PUT /api/schedules/settings
 * @access  Private/Admin
 */
const updateScheduleSettings = asyncHandler(async (req, res) => {
  const { defaultConfig, exceptions = [] } = req.body;

  if (!defaultConfig) {
    return res.status(400).json({ success: false, message: 'Configuration générale requise.' });
  }

  const normalizedExceptions = (exceptions || []).map((exception) => ({
    ...exception,
    startDate: normalizeDateToStart(exception.startDate),
    endDate: normalizeDateToEnd(exception.endDate),
    ...applySessionCap({
      morningStart: exception.morningStart,
      morningEnd: exception.morningEnd,
      afternoonStart: exception.afternoonStart,
      afternoonEnd: exception.afternoonEnd,
      sessionDuration: exception.sessionDuration,
      breaks: exception.breaks || [],
    }),
    breaks: (exception.breaks || []).map((item) => ({
      label: item.label || '',
      startTime: item.startTime,
      endTime: item.endTime,
    })),
  }));

  const settings = await getOrCreateSettings();
  const currentDefaultConfig = settings.defaultConfig
    ? {
      morningStart: settings.defaultConfig.morningStart,
      morningEnd: settings.defaultConfig.morningEnd,
      afternoonStart: settings.defaultConfig.afternoonStart,
      afternoonEnd: settings.defaultConfig.afternoonEnd,
      sessionDuration: settings.defaultConfig.sessionDuration,
      breaks: settings.defaultConfig.breaks || [],
    }
    : DEFAULT_SCHEDULE_CONFIG;

  settings.defaultConfig = {
    ...applySessionCap({
      ...currentDefaultConfig,
      ...defaultConfig,
    }),
  };
  settings.exceptions = normalizedExceptions;
  await settings.save();

  const effective = resolveEffectiveConfig(settings);

  res.status(200).json({
    success: true,
    data: {
      defaultConfig: settings.defaultConfig,
      exceptions: settings.exceptions,
      effectiveConfig: effective.config,
      activeProfile: effective.profile,
      activeException: effective.activeException,
    },
  });
});

module.exports = {
  createSchedule,
  getSchedules,
  getMyScheduleTeacher,
  getMyScheduleStudent,
  updateSchedule,
  deleteSchedule,
  getScheduleSettings,
  updateScheduleSettings,
};
