async function start() {
  try {
    await import("./server.js");
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

start();
