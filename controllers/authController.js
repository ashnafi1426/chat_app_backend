import { AuthService } from '../services/authService.js';
import validator from 'validator';
export class AuthController {
  // Register new user
  static async register(req, res) {
    try {
      const { username, email, password, displayName, full_name, phoneNumber, phone_number } = req.body;
      
      // Validation
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username, email, and password are required',
        });
      }
      
      if (!validator.isEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format',
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long',
        });
      }
      
      if (username.length < 3 || username.length > 30) {
        return res.status(400).json({
          success: false,
          message: 'Username must be between 3 and 30 characters',
        });
      }
      
      // Map field names - accept both camelCase and snake_case
      const { user, tokens } = await AuthService.register({
        username,
        email,
        password,
        displayName: displayName || full_name,
        phoneNumber: phoneNumber || phone_number,
      });
      
      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: { user, tokens },
      });
    } catch (error) {
      console.error('[v0] Registration error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Login user
  static async login(req, res) {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }
      
      const { user, tokens } = await AuthService.login(email, password);
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { user, tokens },
      });
    } catch (error) {
      console.error('[v0] Login error:', error);
      res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Refresh token
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required',
        });
      }
      
      const { accessToken } = await AuthService.refreshToken(refreshToken);
      
      res.status(200).json({
        success: true,
        data: { accessToken },
      });
    } catch (error) {
      console.error('[v0] Token refresh error:', error);
      res.status(401).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Verify email
  static async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      
      const user = await AuthService.verifyEmail(token);
      
      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        data: { user },
      });
    } catch (error) {
      console.error('[v0] Email verification error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Resend verification email
  static async resendVerification(req, res) {
    try {
      const userId = req.user.userId;
      
      await AuthService.resendVerificationEmail(userId);
      
      res.status(200).json({
        success: true,
        message: 'Verification email sent successfully',
      });
    } catch (error) {
      console.error('[v0] Resend verification error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
  
  // Logout user
  static async logout(req, res) {
    try {
      const userId = req.user.userId;
      
      await AuthService.logout(userId);
      
      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('[v0] Logout error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}
