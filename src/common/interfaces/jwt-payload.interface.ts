export interface JwtPayload {
  sub: string; // userId
  email: string;
  username: string;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload extends JwtPayload {
  refreshToken: string;
}
