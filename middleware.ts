import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: { signIn: '/login' },
});

export const config = {
  matcher: [
    '/((?!login|signup|api|_next/static|_next/image|favicon\\.svg|logo\\.svg|og-image\\.png|avatars/).*)',
  ],
};
