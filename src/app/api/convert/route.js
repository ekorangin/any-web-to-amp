import { NextResponse } from 'next/server';
const { convertUrlToAmp } = require('../../../lib/converter');

export async function POST(request) {
  try {
    const body = await request.json();
    const { url, options } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const result = await convertUrlToAmp(url, options || {});
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ 
      error: error.message || 'An error occurred during conversion',
      logs: [error.message]
    }, { status: 500 });
  }
}
