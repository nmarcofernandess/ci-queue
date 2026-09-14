console.log("example: wait")
await new Promise((resolve) => setTimeout(resolve, 1_500))
console.log("example: wait complete")
