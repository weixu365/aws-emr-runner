
class Logger{
  info(msg) {
    console.log(`${new Date().toISOString()} ${msg}`)
  }
}
module.exports = Logger
