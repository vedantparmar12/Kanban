interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
}

interface RefreshResponse {
  accessToken: string;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;

  // Get the current access token from memory
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Set the access token in memory only
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  // Clear the access token from memory
  clearAccessToken(): void {
    this.accessToken = null;
  }

  // Login user with email and password
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include httpOnly cookies
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Login failed');
    }

    const data: AuthResponse = await response.json();
    this.setAccessToken(data.accessToken);
    return data;
  }

  // Register new user
  async register(userData: {
    email: string;
    username: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include httpOnly cookies
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Registration failed');
    }

    const data: AuthResponse = await response.json();
    this.setAccessToken(data.accessToken);
    return data;
  }

  // Refresh access token using httpOnly refresh token cookie
  async refreshAccessToken(): Promise<string> {
    // Prevent multiple simultaneous refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._refreshAccessToken();
    
    try {
      const newToken = await this.refreshPromise;
      this.refreshPromise = null;
      return newToken;
    } catch (error) {
      this.refreshPromise = null;
      throw error;
    }
  }

  private async _refreshAccessToken(): Promise<string> {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // Include httpOnly cookies
    });

    if (!response.ok) {
      // Refresh token is invalid or expired
      this.clearAccessToken();
      throw new Error('Session expired. Please log in again.');
    }

    const data: RefreshResponse = await response.json();
    this.setAccessToken(data.accessToken);
    return data.accessToken;
  }

  // Logout user
  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include httpOnly cookies
        headers: this.getAuthHeaders(),
      });
    } catch (error) {
      // Even if logout request fails, clear local tokens
      console.warn('Logout request failed:', error);
    } finally {
      this.clearAccessToken();
    }
  }

  // Get current user info
  async getCurrentUser(): Promise<User> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await this.makeAuthenticatedRequest('/api/auth/me');
    return response.json();
  }

  // Helper method to make authenticated requests with automatic token refresh
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    let token = this.getAccessToken();

    // If no token, try to refresh
    if (!token) {
      try {
        token = await this.refreshAccessToken();
      } catch (error) {
        throw new Error('Authentication required');
      }
    }

    // Make request with current token
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });

    // If token expired, refresh and retry once
    if (response.status === 401) {
      try {
        token = await this.refreshAccessToken();
        
        // Retry the request with new token
        const retryResponse = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
          },
        });

        return retryResponse;
      } catch (refreshError) {
        // Refresh failed, redirect to login
        this.clearAccessToken();
        throw new Error('Session expired. Please log in again.');
      }
    }

    return response;
  }

  // Get headers for authenticated requests
  getAuthHeaders(): Record<string, string> {
    const token = this.getAccessToken();
    if (!token) {
      return {};
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  // Check if user is authenticated (has valid token)
  isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  // Initialize auth state (try to refresh on app start)
  async initialize(): Promise<User | null> {
    try {
      await this.refreshAccessToken();
      return await this.getCurrentUser();
    } catch (error) {
      // No valid refresh token or user not authenticated
      return null;
    }
  }
}

// Export singleton instance
export const authService = new AuthService();
export default authService;