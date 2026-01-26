import type { ParseResponse } from '../types/puzzle';

export async function parseCrosswordImage(imageBase64: string): Promise<ParseResponse> {
  const response = await fetch('/api/parse-crossword', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64 })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to parse crossword');
  }

  return response.json();
}
