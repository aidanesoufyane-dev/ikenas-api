/**
 * Controller d'authentification
 * Gère le login, le register, et le profil utilisateur
 */
const User = require('../models/User');
const { asyncHandler } = require('../utils/helpers');

/**
 * @desc    Connexion utilisateur
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Vérification des champs
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email et mot de passe requis.',
    });
  }

  // Recherche de l'utilisateur avec le mot de passe
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Identifiants invalides.',
    });
  }

  // Vérification du mot de passe
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Identifiants invalides.',
    });
  }

  // Vérifier si le compte est actif
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Compte désactivé. Contactez l\'administrateur.',
    });
  }

  // Générer le token
  const token = user.generateToken();

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    },
  });
});

/**
 * @desc    Créer un utilisateur (admin uniquement)
 * @route   POST /api/auth/register
 * @access  Private/Admin
 */
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role, phone } = req.body;

  // Vérifier si l'email existe déjà
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'Cet email est déjà utilisé.',
    });
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    role: role || 'student',
    phone,
  });

  res.status(201).json({
    success: true,
    data: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
    },
  });
});

/**
 * @desc    Récupérer le profil connecté
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    data: user,
  });
});

/**
 * @desc    Mettre à jour le mot de passe
 * @route   PUT /api/auth/update-password
 * @access  Private
 */
const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'Mot de passe actuel incorrect.',
    });
  }

  user.password = newPassword;
  await user.save();

  const token = user.generateToken();

  res.status(200).json({
    success: true,
    token,
    message: 'Mot de passe mis à jour avec succès.',
  });
});

module.exports = {
  login,
  register,
  getMe,
  updatePassword,
};
