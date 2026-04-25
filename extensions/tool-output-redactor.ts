import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { redactUnknown } from "./shared/redaction";

export default function toolOutputRedactor(pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    const redactedContent = redactUnknown(event.content);
    const redactedDetails = redactUnknown(event.details);

    if (!redactedContent.changed && !redactedDetails.changed) return;

    return {
      ...(redactedContent.changed ? { content: redactedContent.value } : {}),
      ...(redactedDetails.changed ? { details: redactedDetails.value } : {}),
    };
  });
}
