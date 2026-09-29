import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { redactUnknown } from "./shared/redaction";

export default function toolOutputRedactor(pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    const redactedContent = redactUnknown(event.content);
    const redactedDetails = redactUnknown(event.details);
    const redactedStructuredContent = redactUnknown(event.structuredContent);

    if (!redactedContent.changed && !redactedDetails.changed && !redactedStructuredContent.changed) return;

    return {
      ...(redactedContent.changed ? { content: redactedContent.value } : {}),
      ...(redactedDetails.changed ? { details: redactedDetails.value } : {}),
      // Pi drops structuredContent on a content-only replacement; retain clean typed data too.
      ...(redactedStructuredContent.changed || (redactedContent.changed && event.structuredContent !== undefined)
        ? { structuredContent: redactedStructuredContent.value }
        : {}),
    };
  });
}
