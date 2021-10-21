import { Meteor } from 'meteor/meteor';
import _ from 'underscore';

import { hasPermission } from '../../authorization';
import { API } from './api';
import Rooms from '../../models/server/models/Rooms';

import { getDefaultUserFields } from '/app/utils/server/functions/getDefaultUserFields';
import { findPrivateGroupByIdOrName } from '/app/api/server/v1/groups';
import { executeSendMessage } from '/app/lib/server/methods/sendMessage';
import { normalizeMessagesForUser } from '/app/utils/server/lib/normalizeMessagesForUser';


const axios = require('axios');

const kURL = 'https://dev.konn3ct.net/api/';

// coming from konn3ct chat
API.v1.addRoute('chat.konn3ct.rooms', {
	async get() {
		const { email } = this.queryParams;

		let msg = 'Error in request';
		let data = [];

		return {
			statusCode: 200,
			body: {
				status: true,
				message: 'created',
				data: { name: 'samji' },
			},
		};

		try {
			const response = await axios.get(`${ kURL }rooms/${ email }`);
			// console.log(response);

			const body = response.data;
			console.log('konn3ct response');
			console.log(body);

			if (body.success) {
				console.log(`success: ${ body.success }`);
				status = true;
				data = body.data;
				msg = body.message;

				return {
					statusCode: 200,
					body: {
						success: true,
						message: 'hello',
					},
				};
			}
			msg = body.message;
			return API.v1.failure(msg);
		} catch (e) {
			console.error(e);
			return API.v1.failure(msg);
		}
	},
});

API.v1.addRoute('chat.konn3ct.room.start', {
	get() {
		const { id } = this.queryParams;

		// return {
		// 	statusCode: 200,
		// 	body: {
		// 		status: true,
		// 		message: 'created',
		// 		data: { name: 'samji' },
		// 	},
		// };

		let url = 'https://';
		let msg = 'Error in request';

		axios.get(`${ kURL }start-a-room/${ id }`)
			.then(function(response) {
				// console.log(response);
				const body = response.data;
				console.log('konn3ct response');
				console.log(body);

				return API.v1.success({
					message: 'messge',
					data: body.message,
				});

				return API.v1.success({
					group: { name: 'sammy' },
				});

				if (body.success) {
					status = true;
					url = body.url;
					msg = body.message;

					return API.v1.success({
						message: msg,
						data: url,
					});


					// return {
					// 	statusCode: 401,
					// 	body: {
					// 		status: 'error',
					// 		message: msg,
					// 	},
					// };

					// return API.v1.success({ body });
				}
				msg = body.message;
				return API.v1.failure(msg);
			})
			.catch(function(error) {
				console.log(error);
				return API.v1.failure(msg);
			});
	},
});

// coming from konn3ct server
API.v1.addRoute('konn3ct.create.group', {
	post() {
		const { email } = this.bodyParams;

		// return API.v1.success({
		// 	group: { name: 'sammy' },
		// });

		console.log(`email body ${ email }`);

		if (email == null) {
			return API.v1.failure('Email Required');
		}

		const user = Meteor.users.findOne({
			'emails.address': email,
		}, {
			fields: getDefaultUserFields(),
		});

		console.log('user find');
		console.log(user);

		if (user == null) {
			return API.v1.failure('User not found');
		}

		const userId = user._id;


		if (!hasPermission(userId, 'create-p')) {
			return API.v1.unauthorized();
		}

		if (!this.bodyParams.name) {
			return API.v1.failure('Body param "name" is required');
		}

		if (this.bodyParams.members && !_.isArray(this.bodyParams.members)) {
			return API.v1.failure('Body param "members" must be an array if provided');
		}

		if (this.bodyParams.customFields && !(typeof this.bodyParams.customFields === 'object')) {
			return API.v1.failure('Body param "customFields" must be an object if provided');
		}
		if (this.bodyParams.extraData && !(typeof this.bodyParams.extraData === 'object')) {
			return API.v1.failure('Body param "extraData" must be an object if provided');
		}

		const readOnly = typeof this.bodyParams.readOnly !== 'undefined' ? this.bodyParams.readOnly : false;

		let id;

		Meteor.runAsUser(userId, () => {
			id = Meteor.call('createPrivateGroup', this.bodyParams.name, this.bodyParams.members ? this.bodyParams.members : [], readOnly, this.bodyParams.customFields, this.bodyParams.extraData);
		});

		return API.v1.success({
			group: this.composeRoomWithLastMessage(Rooms.findOneById(id.rid, { fields: API.v1.defaultFieldsToExclude }), userId),
		});
	},
});

API.v1.addRoute('konn3ct.delete.group', {
	post() {
		const { email, roomName } = this.bodyParams;

		console.log(`email body ${ email }`);

		if (email == null) {
			return API.v1.failure('Email Required');
		}

		if (roomName == null) {
			return API.v1.failure('roomName Required');
		}

		const user = Meteor.users.findOne({
			'emails.address': email,
		}, {
			fields: getDefaultUserFields(),
		});

		console.log(`user find ${ user }`);

		if (user == null) {
			return API.v1.failure('User not found');
		}

		const userId = user._id;
		const requestParams = { roomName };

		const findResult = findPrivateGroupByIdOrName({ params: requestParams, userId, checkedArchived: false });

		Meteor.runAsUser(userId, () => {
			Meteor.call('eraseRoom', findResult.rid);
		});

		return API.v1.success();
	},
});

API.v1.addRoute('konn3ct.invite.group', {
	post() {
		const { roomId = '', roomName = '' } = this.requestParams();
		const idOrName = roomId || roomName;
		if (!idOrName.trim()) {
			throw new Meteor.Error('error-room-param-not-provided', 'The parameter "roomId" or "roomName" is required');
		}

		const { _id: rid, t: type } = Rooms.findOneByIdOrName(idOrName) || {};

		if (!rid || type !== 'p') {
			throw new Meteor.Error('error-room-not-found', 'The required "roomId" or "roomName" param provided does not match any group');
		}

		const { email, invitee } = this.bodyParams;

		console.log(`email body ${ email }`);

		if (email == null) {
			return API.v1.failure('Email Required');
		}

		const user = Meteor.users.findOne({
			'emails.address': email,
		}, {
			fields: getDefaultUserFields(),
		});

		console.log('user find');
		console.log(user);

		if (user == null) {
			return API.v1.failure('User not found');
		}

		const userId = user._id;

		// for invitee
		console.log(`invitee email ${ invitee }`);

		if (invitee == null) {
			return API.v1.failure('invitee Email Required');
		}

		const userInvitee = Meteor.users.findOne({
			'emails.address': invitee,
		}, {
			fields: getDefaultUserFields(),
		});

		console.log('invitee find');
		console.log(userInvitee);

		if (userInvitee == null) {
			return API.v1.failure('userInvitee not found');
		}

		this.bodyParams.userId = userInvitee.id;
		this.bodyParams.username = userInvitee.username;

		const users = this.getUserListFromParams();

		if (!users.length) {
			throw new Meteor.Error('error-empty-invite-list', 'Cannot invite if no valid users are provided');
		}

		Meteor.runAsUser(userId, () => Meteor.call('addUsersToRoom', { rid, users: users.map((u) => u.username) }));

		return API.v1.success({
			group: this.composeRoomWithLastMessage(Rooms.findOneById(rid, { fields: API.v1.defaultFieldsToExclude }), this.userId),
		});
	},
});

API.v1.addRoute('konn3ct.sendMessage.group', {
	post() {
		if (!this.bodyParams.message) {
			throw new Meteor.Error('error-invalid-params', 'The "message" parameter must be provided.');
		}

		const { email } = this.bodyParams;

		console.log(`email body ${ email }`);

		if (email == null) {
			return API.v1.failure('Email Required');
		}

		const user = Meteor.users.findOne({
			'emails.address': email,
		}, {
			fields: getDefaultUserFields(),
		});

		console.log(`user find ${ user }`);

		if (user == null) {
			return API.v1.failure('User not found');
		}

		const userId = user._id;

		const sent = executeSendMessage(userId, this.bodyParams.message);
		const [message] = normalizeMessagesForUser([sent], userId);

		return API.v1.success({
			message,
		});
	},
});
