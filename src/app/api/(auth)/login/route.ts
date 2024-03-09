import { config } from 'dotenv';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';

// Load environment variables from .env file
config();

function authenticateUser(email: string, password: string): boolean {
    // Your authentication logic here
    if (email === 'vareyaship@vareyabv.com' && password === '@vareyabvpassword.') {
        return true;
    }
    return false;
}

export async function POST(req: any): Promise<Response> {
    try {
        const body = await req.json();
        const { email, password } = body;

        const isAuthenticated = authenticateUser(email, password);

        if (isAuthenticated) {
            const payload = { userId: email };
            const secret: Secret = process.env.JWT_SECRET as Secret;

            const options: SignOptions = { expiresIn: '1m' };
            const token: string = jwt.sign(payload, secret, options);

           
            return new Response(JSON.stringify({ token }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            // Return a 401 Unauthorized response directly using the Response constructor
            return new Response(JSON.stringify({ error: "Authentication failed" }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        // Handle any unexpected errors
        console.log('Authentication error:', error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
