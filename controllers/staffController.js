const Staff = require('../models/Staff');
const User = require('../models/User');
const { asyncHandler } = require('../utils/helpers');

const LOGIN_ROLE_BY_TYPE = {
  cashier: 'cashier',
  supervisor: 'supervisor',
  reception: 'reception',
};

const createStaff = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    employeeId,
    phone,
    type,
    hasLogin,
    email,
    password,
    notes,
  } = req.body;

  const loginRequired = Boolean(hasLogin);
  let user = null;

  if (loginRequired) {
    const role = LOGIN_ROLE_BY_TYPE[type];
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Ce type de staff ne supporte pas de connexion pour le moment.',
      });
    }

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis pour un staff avec connexion.',
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé.',
      });
    }

    user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role,
    });
  }

  const staff = await Staff.create({
    firstName,
    lastName,
    employeeId,
    phone,
    type,
    hasLogin: loginRequired,
    user: user?._id || null,
    notes,
  });

  const populated = await Staff.findById(staff._id).populate('user', 'email role isActive');
  res.status(201).json({ success: true, data: populated });
});

const getStaff = asyncHandler(async (req, res) => {
  const query = { isActive: true };
  if (req.query.type) {
    query.type = req.query.type;
  }

  const staff = await Staff.find(query)
    .populate('user', 'email role isActive')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: staff });
});

const updateStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff || !staff.isActive) {
    return res.status(404).json({ success: false, message: 'Staff introuvable.' });
  }

  const {
    firstName,
    lastName,
    employeeId,
    phone,
    type,
    hasLogin,
    email,
    password,
    notes,
  } = req.body;

  if (employeeId && employeeId !== staff.employeeId) {
    const existingStaff = await Staff.findOne({ employeeId, _id: { $ne: staff._id } });
    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: 'Ce matricule est déjà utilisé.',
      });
    }
  }

  const nextType = type || staff.type;
  const nextHasLogin = hasLogin !== undefined ? Boolean(hasLogin) : staff.hasLogin;

  let linkedUser = staff.user ? await User.findById(staff.user) : null;

  if (nextHasLogin) {
    const role = LOGIN_ROLE_BY_TYPE[nextType];
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Ce type de staff ne supporte pas de connexion pour le moment.',
      });
    }

    const targetEmail = email || linkedUser?.email;
    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email requis pour un staff avec connexion.',
      });
    }

    const existingUser = await User.findOne({
      email: targetEmail,
      _id: linkedUser?._id ? { $ne: linkedUser._id } : { $exists: true },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé.',
      });
    }

    if (!linkedUser) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Mot de passe requis pour créer un accès connexion.',
        });
      }

      linkedUser = await User.create({
        firstName: firstName || staff.firstName,
        lastName: lastName || staff.lastName,
        email: targetEmail,
        password,
        phone: phone ?? staff.phone,
        role,
      });
      staff.user = linkedUser._id;
    } else {
      linkedUser.firstName = firstName || staff.firstName;
      linkedUser.lastName = lastName || staff.lastName;
      linkedUser.phone = phone ?? staff.phone;
      linkedUser.email = targetEmail;
      linkedUser.role = role;
      linkedUser.isActive = true;

      if (password) {
        linkedUser.password = password;
      }

      await linkedUser.save();
    }
  } else if (linkedUser) {
    linkedUser.isActive = false;
    await linkedUser.save();
  }

  staff.firstName = firstName ?? staff.firstName;
  staff.lastName = lastName ?? staff.lastName;
  staff.employeeId = employeeId ?? staff.employeeId;
  staff.phone = phone ?? staff.phone;
  staff.type = nextType;
  staff.hasLogin = nextHasLogin;
  staff.notes = notes ?? staff.notes;

  await staff.save();

  const populated = await Staff.findById(staff._id).populate('user', 'email role isActive');
  res.status(200).json({ success: true, data: populated, message: 'Staff mis à jour avec succès.' });
});

const deleteStaff = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.params.id);
  if (!staff) {
    return res.status(404).json({ success: false, message: 'Staff introuvable.' });
  }

  staff.isActive = false;
  await staff.save();

  if (staff.user) {
    await User.findByIdAndUpdate(staff.user, { isActive: false });
  }

  res.status(200).json({ success: true, message: 'Staff désactivé avec succès.' });
});

module.exports = {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
};