# BloodCare React Frontend

## API
The app uses:
GET /donor
POST /donor
GET /donor/{donorId}
PUT /donor/{donorId}
DELETE /donor/{donorId}

`.env` contains the stage URL only:
VITE_API_BASE_URL=https://ftghqb77x2.execute-api.us-east-1.amazonaws.com/dev

The app appends `/donor`, so `/donor/donor` is never created.

## Run
npm install
npm run dev

`npm start` is also supported.

## Build for S3
npm run build
Upload the contents of `dist/` to S3 and serve through CloudFront.

## Donor ID
The UI accepts a manually entered DynamoDB partition key. The create placeholder is DONOR-0001. Edit keeps donorId disabled because it is the partition key.

After changing `.env`, restart Vite and run a fresh production build.
