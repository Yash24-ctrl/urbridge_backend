import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { EMAIL_PATTERN, normalizeEmailValue } from '../utils/emailValidation.js';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: function () {
        return !this.googleId && !this.linkedinId; // username required only for non-social users
      },
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      set: normalizeEmailValue,
      match: [EMAIL_PATTERN, 'Please provide a valid email address.'],
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.linkedinId; // password required only for non-social users
      },
      minlength: 6,
    },
    googleId: {
      type: String,
      default: null,
      sparse: true, // allows multiple nulls without unique conflict
    },
    linkedinId: {
      type: String,
      default: null,
      sparse: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
