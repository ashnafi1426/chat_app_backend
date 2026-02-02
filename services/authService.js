import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/config.js';
import { EmailService } from './emailService.js';

export class AuthService {

  // ================================
  // TOKEN HELPERS
  // ================================
  static generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        type: 'access',
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        type: 'refresh',
      },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  static generateVerificationToken(userId, email) {
    return jwt.sign(
      {
        userId,
        email,
        type: 'email_verification',
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );
  }

  // ================================
  // REGISTER
  // ================================
  static async register({ username, email, password, displayName, phoneNumber }) {

    // Check duplicates (SAFE)
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .or(`username.eq.${username},email.eq.${email}`);

    if (existing?.length) {
      throw new Error('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = uuidv4();

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        username,
        email,
        display_name: displayName || username,
        phone: phoneNumber,
        password_hash: passwordHash,
        status: 'offline',
        email_verified: false,
        is_active: true,
      })
      .select('id, username, email, display_name')
      .single();

    if (error) {
      console.error(error);
      throw new Error('Failed to create user');
    }

    const tokens = this.generateTokens(user);

    // Send verification email
    const verificationToken = this.generateVerificationToken(user.id, user.email);
    await EmailService.sendVerificationEmail(user.email, user.username, verificationToken);

    return { user, tokens };
  }

  // ================================
  // LOGIN
  // ================================
  static async login(email, password) {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      throw new Error('Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new Error('Invalid email or password');
    }

    await supabaseAdmin
      .from('users')
      .update({
        status: 'online',
        last_seen: new Date().toISOString(),
      })
      .eq('id', user.id);

    const tokens = this.generateTokens(user);

    delete user.password_hash;

    return { user, tokens };
  }

  // ================================
  // REFRESH TOKEN
  // ================================
  static async refreshToken(refreshToken) {
    let decoded;

    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      throw new Error('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, username, email')
      .eq('id', decoded.userId)
      .single();

    if (!user) {
      throw new Error('User not found');
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        type: 'access',
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return { accessToken };
  }

  // ================================
  // VERIFY EMAIL (SEPARATE TOKEN)
  // ================================
  static async verifyEmail(token) {
    let decoded;

    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch {
      throw new Error('Invalid or expired token');
    }

    if (decoded.type !== 'email_verification') {
      throw new Error('Invalid token type');
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({ email_verified: true })
      .eq('id', decoded.userId)
      .select('id, username, email, email_verified')
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    return user;
  }

  // ================================
  // RESEND VERIFICATION EMAIL
  // ================================
  static async resendVerificationEmail(userId) {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, email_verified')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new Error('User not found');
    }

    if (user.email_verified) {
      throw new Error('Email already verified');
    }

    const verificationToken = this.generateVerificationToken(user.id, user.email);
    await EmailService.sendVerificationEmail(user.email, user.username, verificationToken);

    return true;
  }

  // ================================
  // LOGOUT
  // ================================
  static async logout(userId) {
    await supabaseAdmin
      .from('users')
      .update({
        status: 'offline',
        last_seen: new Date().toISOString(),
      })
      .eq('id', userId);

    return true;
  }
}
