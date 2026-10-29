# GymOS

GymOS is organized as two independent frontend apps and separate backend
workspaces. The frontends still use local mock data; the admin backend now
contains the initial MongoDB connection utility and Mongoose schemas.

## Structure

- `admin-staff-app/frontend` — Dashboard, Members, Memberships, Attendance,
  Payments, and Trainers & Workouts.
- `admin-staff-app/backend` — Mongoose connection utility and Gym, Member,
  Membership, Attendance, and Payment models, plus an idempotent demo seed
  script.
- `admin-staff-app/frontend/src/app/api/members` — Tenant-scoped Members API.
- `mobile-app/frontend` — Standalone member app prototype.
- `mobile-app/backend` — Reserved for the future mobile app backend.

## Run locally

Install dependencies from the project root:

```bash
npm install
```

For database use, add this to
`admin-staff-app/frontend/.env.local`:

```env
MONGODB_URI=your_mongodb_connection_string
GYMOS_GYM_ID=the_seeded_gym_object_id
GYMOS_SESSION_SECRET=your_random_secret_at_least_32_characters
GYMOS_STAFF_INVITE_CODE=your_private_staff_invitation_code
```

Keep the real connection string private and do not commit `.env.local`.
Generate a session secret with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`
and choose a private invitation code to share only with staff.
If the system DNS resolver cannot resolve Atlas SRV records, set
`MONGODB_DNS_SERVERS=1.1.1.1` in that file to use Cloudflare DNS for MongoDB
lookups.

The Members API also requires the active gym's MongoDB ObjectId in the same
file. Run the seed command once to create the sample gym and get its ID:

```bash
npm run seed:admin
```

Add the printed ID to `admin-staff-app/frontend/.env.local`:

```env
GYMOS_GYM_ID=the_seeded_gym_object_id
```

Restart the admin app after editing environment variables. The API is available
at `http://localhost:3000/api/members`: use `GET` to list members and `POST`
with JSON fields `fullName`, `phone`, `plan`, `price`, and `duration` to create
a member and membership together. `startDate` and `email` are optional. The
Members page sends these fields directly and reloads the list after creation.

In separate terminals, start either or both frontend apps:

```bash
npm run dev:admin
npm run dev:member
```

Open the admin/staff app at [http://localhost:3000](http://localhost:3000)
and the member app at [http://localhost:3001](http://localhost:3001). The
admin app starts at the staff sign-in screen; use `/register` with the staff
invitation code to create the first staff account. The admin header and member
app header link between these local apps. For other hosts, set
`NEXT_PUBLIC_MEMBER_APP_URL` and `NEXT_PUBLIC_ADMIN_APP_URL`.

Run the app checks with:

```bash
npm run lint:admin
npm run lint:member
npm run build:admin
npm run build:member
npm run typecheck:backend
```
