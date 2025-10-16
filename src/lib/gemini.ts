const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_KEY ?? '';
const GEMINI_ACCESS_KEY = import.meta.env.VITE_GEMINI_ACCESS_KEY ?? '';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export type ReceiptFields = {
  usageDate: string;
  usageItem: string;
  usageDescription: string;
  usagePlace: string;
  usageAmount: string;
  notes?: string;
};

export const isGeminiConfigured = Boolean(GEMINI_API_KEY);
export const getGeminiKey = () => GEMINI_ACCESS_KEY;

export type GeminiImagePayload = {
  data: string;
  mimeType: string;
};

export const analyzeReceipt = async (image: GeminiImagePayload): Promise<ReceiptFields> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Add VITE_GEMINI_KEY to your environment.');
  }

  const { data, mimeType } = image;
  const effectiveMimeType = mimeType || 'image/png';

  const prompt = `You are a receipt extraction assistant. Extract the following fields from the supplied receipt image and reply ONLY with JSON:
{
  "usageDate": "YYYY-MM-DD or as printed",
  "usageItem": "primary product/service name",
  "usageDescription": "key line items or memo summarising the receipt",
  "usagePlace": "store or company name",
  "usageAmount": "total amount (include currency symbol if available)",
  "notes": "additional hints such as VAT, payment method, card suffix"
}
If a field cannot be found, return an empty string for that property.`;

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: effectiveMimeType,
                data,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const bodyText = await response.text();

    let parsedError: {
      error?: {
        message?: string;
        status?: string;
        details?: Array<{ reason?: string }>;
      };
    } | null = null;

    try {
      parsedError = JSON.parse(bodyText);
    } catch {
      parsedError = null;
    }

    const errorInfo = parsedError?.error;
    const errorMessage = errorInfo?.message ?? '';
    const reason =
      errorInfo?.details?.find((detail) => typeof detail?.reason === 'string')?.reason ?? '';

    if (
      reason === 'API_KEY_INVALID' ||
      errorInfo?.status === 'INVALID_ARGUMENT' ||
      errorMessage.includes('API key not valid')
    ) {
      throw new Error(
        'Invalid Gemini API key. Generate a new one in Google AI Studio, update VITE_GEMINI_KEY, then try again.',
      );
    }

    if (errorMessage) {
      throw new Error(`Gemini API error: ${response.status} ${errorMessage}`);
    }

    const fallback = bodyText || response.statusText || 'Unknown error';
    throw new Error(`Gemini API error: ${response.status} ${fallback}`);
  }

  const payload = await response.json();
  const text =
    payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text).join(' ') ??
    '';

  if (!text) {
    throw new Error('Gemini did not return any text.');
  }

  let parsed: ReceiptFields | null = null;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      parsed = JSON.parse(match[0]!);
    }
  }

  if (!parsed) {
    throw new Error('Failed to parse Gemini response.');
  }

  return {
    usageDate: parsed.usageDate ?? '',
    usageItem: parsed.usageItem ?? '',
    usageDescription: parsed.usageDescription ?? '',
    usagePlace: parsed.usagePlace ?? '',
    usageAmount: parsed.usageAmount ?? '',
    notes: parsed.notes ?? '',
  };
};
