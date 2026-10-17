if (process.env.RECEIPT_TEST_MODE === "hang") {
  for (;;) { /* Deliberately blocking CPU: only process termination can stop this. */ }
} else if (process.env.RECEIPT_TEST_MODE === "crash") {
  process.exit(7);
} else if (process.env.RECEIPT_TEST_MODE === "malformed") {
  process.on("message", () => process.send({ ok: true, width: -1 }));
} else {
  await import("../../../app/lib/receipt-file-worker.mjs");
}
