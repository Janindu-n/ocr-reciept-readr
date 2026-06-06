import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const responseSchema = {
  type: "object",
  properties: {
    vendor_name: { type: "string" },
    date: { type: "string" },
    total_amount: { type: "number" },
    tax_amount: { type: "number" },
    category: {
      type: "string",
      enum: ["Meals", "Software", "Travel", "Office Supplies", "Other"],
    },
  },
  required: ["vendor_name", "date", "total_amount", "tax_amount", "category"],
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
        { status: 500 }
      );
    }
    const ai = new GoogleGenAI({ apiKey });

    const formData = await req.formData();
    const file = formData.get("receipt") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No receipt image provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            {
              text: "You are an accounting assistant. Extract receipt data from this image and return valid JSON.",
            },
            {
              inlineData: { mimeType, data: base64 },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json({ error: "No response from Gemini" }, { status: 500 });
    }

    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json({ error: "Failed to process receipt" }, { status: 500 });
  }
}
