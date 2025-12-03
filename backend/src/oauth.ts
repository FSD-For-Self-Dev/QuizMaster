import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db, User } from './database';
import { authService } from './auth';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret';

// Configure Passport Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken: string, refreshToken: string, profile: any, done: Function) => {
      try {
        const { id, emails, displayName, photos } = profile;

        // Check if user already exists with this Google account
        let user = await db.findUserByProvider('google', id);

        if (user) {
          // User exists, update their info if needed
          done(null, user);
        } else {
          // Check if user exists with same email (for account linking)
          const existingUser = await db.findUserByEmail(emails[0].value);

          if (existingUser) {
            // Link Google account to existing user
            // Note: This would require an additional database operation to update the existing user
            // For simplicity, we'll create a new user for now
            done(null, existingUser);
          } else {
            // Create new user
            const username = displayName.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 1000);
            const avatarUrl = photos && photos.length > 0 ? photos[0].value : undefined;

            user = await db.createOAuthUser({
              email: emails[0].value,
              username,
              provider: 'google',
              provider_id: id,
              avatar_url: avatarUrl,
            });

            done(null, user);
          }
        }
      } catch (error) {
        done(error, null);
      }
    }
  )
);

// Serialize user for session
passport.serializeUser((user: User, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    // For OAuth, we'll store the user in a temporary store or return the user directly
    // Since we're using JWT, we might not need full session deserialization
    done(null, { id });
  } catch (error) {
    done(error, null);
  }
});

export const oauthHandlers = {
  // Initiate Google OAuth
  googleAuth: passport.authenticate('google', {
    scope: ['profile', 'email'],
  }),

  // Handle Google OAuth callback
  googleCallback: passport.authenticate('google', {
    failureRedirect: '/api/auth/google/failure',
    session: false,
  }),

  // Handle successful OAuth
  googleSuccess: async (req: any, res: any) => {
    try {
      const user = req.user as User;

      // Generate JWT token
      const token = authService.generateToken({
        id: user.id,
        email: user.email,
        username: user.username,
      });

      // Redirect to frontend with token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=google`);
    } catch (error) {
      console.error('OAuth success handler error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_failed`);
    }
  },

  // Handle OAuth failure
  googleFailure: (req: any, res: any) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=oauth_failed`);
  },
};
