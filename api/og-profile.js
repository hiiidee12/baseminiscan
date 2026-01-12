import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const score = searchParams.get("score") || "0.64";

  const templateUrl = `${origin}/assets/og-template.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          background: "#0b1220",
        }}
      >
        <img
          src={templateUrl}
          style={{
            position: "absolute",
            inset: 0,
            width: "1200px",
            height: "630px",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 78, // sesuaikan kalau kurang pas
            textAlign: "center",
            fontSize: 44,
            fontWeight: 600,
            color: "#d7e6ff",
            textShadow: "0 6px 18px rgba(0,0,0,.55)",
            fontFamily: "Inter, Arial",
            letterSpacing: 0.2,
          }}
        >
          {`My neynar score is ${score} ❄️`}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
