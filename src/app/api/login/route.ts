import { NextResponse } from 'next/server';
import { config } from 'dotenv';
import jwt, { Secret, SignOptions } from 'jsonwebtoken';

// Load environment variables from .env file
config();

async function authenticateUser(email: string, password: string): Promise<boolean> {
    // Your authentication logic here
    if (email === 'asd' && password === 'asd') {
        return true;
    }
    return false;
}

export async function POST(req: any) {
    const body = await req.json();
    const { email, password } = body;


    const isAuthenticated = await authenticateUser(email, password);
    console.log(isAuthenticated)
    if (isAuthenticated) {
        const payload = { userId: email };
        const secret: Secret = process.env.JWT_SECRET as Secret;
        console.log(secret)
        const options: SignOptions = { expiresIn: '1m' };
        const token: string = jwt.sign(payload, secret, options);

        return NextResponse.json({ token });
    } else {
        return {
            status: 401,
            statusText: "Unauthorized",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ error: "Authentication failed" })
        };
    }
}
