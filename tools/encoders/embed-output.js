const EMBED_FRONTENDS = {
  affine: "frontends/affine.html",
  aristocrat: "frontends/aristocrat.html",
  baconian: "frontends/baconian.html",
  checkerboard: "frontends/checkerboard.html",
  fractionatedmorse: "frontends/fractionatedmorse.html",
  hill: "frontends/hill.html",
  nihilist: "frontends/nihilist.html",
  porta: "frontends/porta.html"
};

function embedObjectLiteral(data) {
  return JSON.stringify(data, null, 2)
    .split("\n")
    .map((line, index) => index === 0 ? line : `    ${line}`)
    .join("\n");
}

async function buildCipherEmbed(frontendName, defaultData) {
  const frontendPath = EMBED_FRONTENDS[frontendName];
  if (!frontendPath) {
    throw new Error(`No frontend template configured for ${frontendName}.`);
  }

  const response = await fetch(frontendPath);
  if (!response.ok) {
    throw new Error(`Unable to load ${frontendPath}.`);
  }

  const source = await response.text();
  const replacement = `const defaultData = ${embedObjectLiteral(defaultData)};`;
  const updatedSource = source.replace(/const defaultData = \{[\s\S]*?\n\s*\};/, replacement);
  if (updatedSource === source) {
    throw new Error(`Could not find defaultData in ${frontendPath}.`);
  }
  return updatedSource;
}

function questionTextWithValue(value, text) {
  return `[${value}] ${text}`;
}

function lettersOnlyAnswer(text, extraLetters = "") {
  const escaped = extraLetters.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.toUpperCase().replace(new RegExp(`[^A-Z${escaped}]`, "g"), "");
}

async function setLatexOrEmbedOutput(outputId, revealKeyword, frontendName, defaultData, latex) {
  const output = document.getElementById(outputId);
  if (!revealKeyword.trim()) {
    output.value = latex;
    return;
  }

  try {
    output.value = await buildCipherEmbed(frontendName, {
      ...defaultData,
      revealKeyword: revealKeyword.trim()
    });
  } catch (error) {
    output.value = `Could not generate embed source: ${error.message}`;
  }
}
