# fno-stock-derivative-server
# npm run dev
# npm run start
https://www.robinwieruch.de/minimal-node-js-babel-setup


//BACK-UP DATA
mongodump --port 27018 -d Derivatives -o /home/raj/Desktop/Database-Backup/Derivatives/
mongodump --port 27017 -d DataAnalysis -o G:\FNO-Project\Database-Backup\Derivatives
mongodump --port 27017 -d DataAnalysis -o G:\FNO-Project\DAILY-DATABASE-BACKUP\Derivatives

//RESTORE-DATA
mongorestore --port 27018 /home/raj/Desktop/Database-Backup/Derivatives/
mongorestore --port 27017 G:\FNO-Project\Database-Backup\Derivatives
