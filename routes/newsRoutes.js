const express = require('express');
const { respondToNews, 
  getPosts,
  createPost,
  toggleLike,
  addComment,
  deletePost,
  deleteComment,
} = require('../controllers/newsController');
const { protect, roleCheck } = require('../middleware/auth');
const { uploadNewsImage } = require('../middleware/upload');

const router = express.Router();

router.route('/')
  .get(protect, getPosts)
  .post(protect, roleCheck('admin'), uploadNewsImage.single('image'), createPost);

router.post('/:id/like', protect, toggleLike);
router.post('/:id/comments', protect, addComment);
router.delete('/:id', protect, roleCheck('admin'), deletePost);
router.delete('/:id/comments/:commentId', protect, roleCheck('admin'), deleteComment);

module.exports = router;
