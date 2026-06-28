export async function POST(request: Request) {
  let name = "";

  try {
    const body = await request.json();
    name = typeof body.name === "string" ? body.name.trim() : "";
  } catch {
    return Response.json({ allowed: false, message: "Invalid request." }, { status: 400 });
  }

  if (!name) {
    return Response.json({ allowed: false, message: "Enter a name." }, { status: 400 });
  }

  if (name.length > 18) {
    return Response.json({ allowed: false, message: "Name is too long." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://www.purgomalum.com/service/containsprofanity?text=${encodeURIComponent(name)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return Response.json(
        { allowed: false, message: "Unable to check that name. Try again." },
        { status: 502 }
      );
    }

    const result = (await response.text()).trim().toLowerCase();
    const hasProfanity = result === "true";

    return Response.json({
      allowed: !hasProfanity,
      message: hasProfanity ? "That name isn't allowed. Try something else." : null,
    });
  } catch {
    return Response.json(
      { allowed: false, message: "Unable to check that name. Try again." },
      { status: 502 }
    );
  }
}
