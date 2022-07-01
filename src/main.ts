import { loadFontsAsync } from "@create-figma-plugin/utilities";
import { precomputeValues, FontMetrics } from "@capsizecss/core";
import interFontMetrics from "@capsizecss/metrics/inter";

const sfMetrics = {
  capHeight: 1443,
  ascent: 1950,
  descent: -494,
  lineGap: 0,
  unitsPerEm: 2048,
};

// Hard coded for preview release
const fontMetrics: Record<string, FontMetrics> = {
  Inter: interFontMetrics,
  "SF Mono": sfMetrics,
  "SF Pro": sfMetrics,
  "SF Pro Display": sfMetrics,
  "SF Pro Rounded": sfMetrics,
  "SF Pro Text": sfMetrics,
};

function isNodeOwned(node: SceneNode) {
  return node.getPluginData("owned") === "true";
}

function markNodeAsOwned(node: SceneNode) {
  node.setPluginData("owned", "true");
}

export default async function () {
  await loadFontsAsync(
    figma.currentPage.selection.reduce(
      (acc, selection) => [
        ...acc,
        selection,
        ...("children" in selection ? [...selection.children] : []),
      ],
      [] as SceneNode[]
    )
  );

  figma.currentPage.selection.forEach((selectedNode) => {
    const textNode =
      selectedNode.type === "TEXT"
        ? selectedNode
        : selectedNode.type === "FRAME" &&
          isNodeOwned(selectedNode) &&
          selectedNode.children.length === 1 &&
          selectedNode.children[0].type === "TEXT"
        ? selectedNode.children[0]
        : null;

    if (!textNode) {
      return;
    }

    if (textNode.fontName === figma.mixed) {
      figma.notify("Leading cannot be trimmed from text with mixed fonts.");
      return;
    }

    if (textNode.fontSize === figma.mixed) {
      figma.notify("Leading cannot be trimmed from text with mixed sizes.");
      return;
    }

    if (textNode.lineHeight === figma.mixed) {
      figma.notify(
        "Leading cannot be trimmed from text with mixed line heights."
      );
      return;
    }

    if (textNode.lineHeight.unit === "PERCENT") {
      figma.notify(
        "Percentage based line height values are not currently supported in this preview release."
      );
      return;
    }

    if (!(textNode.fontName.family in fontMetrics)) {
      figma.notify(
        `The font "${textNode.fontName.family}" is not currently supported in this preview release.`
      );
      return;
    }

    if (textNode.textAutoResize === "NONE") {
      textNode.textAutoResize = "HEIGHT";
    }

    const options = {
      fontSize: textNode.fontSize,
      leading:
        textNode.lineHeight.unit !== "AUTO"
          ? textNode.lineHeight.value
          : undefined,
      fontMetrics: fontMetrics[textNode.fontName.family],
    };

    const capsizeValues = precomputeValues(options);
    const marginTop =
      parseFloat(capsizeValues.capHeightTrim) * textNode.fontSize;
    const marginBottom =
      parseFloat(capsizeValues.baselineTrim) * textNode.fontSize;

    // Add new margins
    const parent = textNode.parent ?? figma.currentPage;
    const index = parent.children.indexOf(textNode);

    const isFirstRun = parent.type !== "FRAME" || !isNodeOwned(parent);
    const frame = isFirstRun ? figma.createFrame() : (parent as FrameNode);
    markNodeAsOwned(frame);

    frame.name = " "; // This ensures a frame name is not visible in the UI
    frame.fills = [];
    frame.clipsContent = false; // Allows ascenders/descenders to be visible
    frame.resize(textNode.width, textNode.height + marginTop + marginBottom);

    if (isFirstRun) {
      frame.appendChild(textNode);
      frame.x = textNode.x;
      frame.y = textNode.y - marginTop;
      parent.insertChild(index, frame);
    } else {
      frame.x = frame.x + textNode.x;
      frame.y = frame.y + textNode.y - marginTop;
    }

    textNode.x = 0;
    textNode.y = marginTop;
  });

  figma.closePlugin();
}