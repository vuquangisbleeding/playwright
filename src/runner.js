// Entry point giữ mỏng để luồng khởi động dễ tìm và dễ kiểm tra.
const { main } = require('./main');

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
