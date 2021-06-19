// User that logs in.
// Account's also have names on top users.

import mongoose from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';

interface User extends mongoose.Document {
  username: string;
  password: string;
  secret?: string;
  firstName: string;
  lastName: string;
  accounts: [mongoose.ObjectId];
  latestLogin: number;
  lastestPasswordChange: number;
}

const user = new mongoose.Schema<User>({
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    secret: {
      type: String,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    accounts: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
      }],
      default: []
    },
    latestLogin: {
      type: Date,
      default: Date.now
    },
    lastestPasswordChange: {
      type: Date,
      default: Date.now
    }
});

user.plugin(uniqueValidator);

export default mongoose.model<User>('User', user);