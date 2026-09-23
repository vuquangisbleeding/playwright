#!/bin/zsh
set -e
cd "$(dirname "$0")"
npm start
printf '\nRunner đã kết thúc. Nhấn Enter để đóng cửa sổ này. '
read
