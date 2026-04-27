import "jsr:@std/dotenv/load";

export const API_URL = Deno.env.get("API_URL")