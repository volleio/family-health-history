import * as env from 'dotenv';
env.config();
import * as bodyParser from 'body-parser';
import * as connectRedis from 'connect-redis';
import * as crypto from 'crypto';
import * as express from 'express';
import * as rateLimit from 'express-rate-limit';
import * as session from 'express-session';
import * as mongodb from 'mongodb';
import nodeFetch from 'node-fetch';
import * as path from 'path';
import * as querystring from 'querystring';
import * as redis from 'redis';
import * as favicon from 'serve-favicon';
import { request } from 'http';

class FamilyHealthHistoryServer
{
	/**
	 * Static vars
	 */
	private static PORT = process.env.PORT || 5000;
	private static SESSION_SECRET = process.env.SESSION_SECRET || 'session secret';
	private static REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
	private static MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/family-health-history';
	private static MONGODB_DBNAME = process.env.MONGODB_DBNAME || 'family-health-history';
	
	private static DEBUG = FamilyHealthHistoryServer.SESSION_SECRET === 'debug';
	
	private static THEME = process.env.THEME || '';
	private static ALLOWED_THEMES = ['alt-theme'];

	private static NOTES_REQUEST_LIMIT = 2;

	/**
	 * Member vars
	 */
	private app: express.Express;
	private redisSessionStore: connectRedis.RedisStore;
	private loginDataDb: mongodb.Collection;

	constructor()
	{
		this.Initialize();
	}

	private Initialize(): void
	{		
		const redisStore = connectRedis(session);
		const redisClient = redis.createClient(FamilyHealthHistoryServer.REDIS_URL);
		this.redisSessionStore = new redisStore({
			client: redisClient,
			ttl: 3600,
		});

		this.app = express();
		this.app.use(session({
			secret: FamilyHealthHistoryServer.SESSION_SECRET, 
			store: this.redisSessionStore,
			saveUninitialized: false, 
			resave: true,
		}));
		
		this.app.use(bodyParser.json());
		this.app.use(bodyParser.urlencoded({ extended: true }));
		this.app.use(favicon(`${__dirname}/images/favicon.ico`));
		this.app.use('/stylesheets', express.static(path.join(__dirname, 'stylesheets')));
		this.app.use('/js', express.static(path.join(__dirname, 'client')));
		this.app.use('/images', express.static(path.join(__dirname, 'images')));

		// Rate limit api methods
		// @ts-ignore
		const apiLimiter = rateLimit({
			windowMs: 15 * 60 * 1000, // 15 minutes
			max: FamilyHealthHistoryServer.DEBUG ? 1000 : 10,
			message: { error: 'Too many login requests. Please wait 15 minutes and try again.' },
		});
		this.app.use('/login', apiLimiter);
		
		this.app.set('views', __dirname);
		this.app.set('view engine', 'ejs');
		this.app.set('trust proxy', 1);
		
		this.app.get('/', (req, res) => 
		{
			let theme = FamilyHealthHistoryServer.THEME;
			if (req.query.theme && typeof(req.query.theme) === 'string' && FamilyHealthHistoryServer.ALLOWED_THEMES.includes(req.query.theme))
				theme = req.query.theme;

			res.render('pages/index', { theme });
		});

		this.SetupRouting();

		// set up mongodb before starting this.app.listening
		const mongodbClient = mongodb.MongoClient;
		mongodbClient.connect(FamilyHealthHistoryServer.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) =>
		{
			if (err)
			{
				console.error(err);
				client.close();
				process.exit(1);
			}

			const db = client.db(FamilyHealthHistoryServer.MONGODB_DBNAME);
			this.loginDataDb = db.collection('user_data');

			this.app.listen(FamilyHealthHistoryServer.PORT, () => console.log(`Listening on ${ FamilyHealthHistoryServer.PORT }`));

		});

	}

	private SetupRouting(): void
	{
		this.app.post('/login', async (req, res) => this.OnLoginReq(req, res));
		this.app.post('/create-account', async (req, res) => this.OnCreateAccountReq(req, res));
		this.app.post('/save-tree', async (req, res) => this.OnSaveTreeReq(req, res));
		this.app.post('/family-request-response', async (req, res) => this.OnFamilyRequestResponseReq(req, res));
		this.app.post('/logout', async (req, res) => this.OnLogoutReq(req, res));
	}

	private async OnLoginReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send(); // Is redis running?
				
		const loginInput = req.body.loginId;
		
		// Prevent mongo injection attacks
		if (typeof loginInput !== 'string' || loginInput.startsWith('$'))
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.failure });
		
		// check if user exists
		let userData;
		try 
		{
			userData = await this.loginDataDb.findOne({ _id: loginInput.toLowerCase() });
		}
		catch (err)
		{
			console.error('Error attempting to find user id in db in login call:');
			console.error(err);
			return res.status(500).send();
		}
		
		if (!userData)
		{
			req.session.key = loginInput;
			return res.send({ authenticationStatus: AuthenticationStatus.userNotFound });
		}
		
		req.session.key = loginInput;
		
		// Check if any other users have added you
		let familyRequests;
		try 
		{
			familyRequests = await this.GetFamilyRequests(req);
		}
		catch (err)
		{
			console.error('Error attempting to find family reqests in db in login call:');
			console.error(err);
			return res.status(500).send();
		}

		// TODO: get rid of this
		// Cache user's data in session so that we don't have to hit the db on later requests
		req.session.userData = userData;


		// Get data from other people who've approved you
		if (userData.family_nodes)
		{
			for (let i = 0; i < userData.family_nodes.length; i++) 
			{
				let node = userData.family_nodes[i];
				if (node.Email && node.Email.toLowerCase() != loginInput.toLowerCase())
				{
					try
					{
						const familyData = await this.loginDataDb.findOne({ "_id": node.Email.toLowerCase() });
						if (familyData.approved_family.some((el) => el === loginInput.toLowerCase()))
						{
							const selfData = familyData.family_nodes.find(theirNode => theirNode.id === 1);
							if (selfData && selfData["Medical Conditions"])
							{
								const conditions = JSON.parse(selfData["Medical Conditions"]);
								if (conditions.length > 0)
								{
									const publicConditions = conditions.filter(condition => !condition.locked)
									if (publicConditions && publicConditions.length > 0)
										node["Medical Conditions"] = JSON.stringify(publicConditions);
								}
							}
						}
					}
					catch (err)
					{
						// Just don't sync the data
					}
				}
			}
		}

		
		return res.send({ 
			authenticationStatus: AuthenticationStatus.success,
			family_nodes: userData.family_nodes,
			familyRequests: familyRequests
		});
	}

	private async OnCreateAccountReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send();
				
		// Successful initial username creation, save new account
		try
		{
			await this.loginDataDb.insertOne({ 
				_id: req.session.key.toLowerCase(),
			});
		}
		catch (err)
		{
			console.error('Error attempting to save new account to db in create-account call:');
			console.error(err);
			return res.status(500).send({ authenticationStatus: AuthenticationStatus.error });
		}

		// Check if any other users have added you
		let familyRequests;
		try 
		{
			familyRequests = await this.GetFamilyRequests(req);
		}
		catch (err)
		{
			console.error('Error attempting to find family reqests in db in login call:');
			console.error(err);
			return res.status(500).send();
		}

		return res.send({ authenticationStatus: AuthenticationStatus.success, familyRequests: familyRequests });
	}

	private async GetFamilyRequests(req: express.Request): Promise<any[]>
	{
		const familyRequestsCursor = await this.loginDataDb.find({ "family_nodes.Email": req.session.key.toLowerCase() }).project({"_id": 1});
		const familyRequests = await familyRequestsCursor.toArray();

		return familyRequests.filter((request) => 
		{
			if (request._id.toLowerCase() === req.session.key.toLowerCase())
				return false;

			if (req.session.userData && req.session.userData.approved_family && req.session.userData.approved_family.some((el: string) => el.toLowerCase() === request._id))
				return false;
				
			if (req.session.userData && req.session.userData.disapproved_family && req.session.userData.disapproved_family.some((el: string) => el.toLowerCase() === request._id))
				return false;

			return true;
		});
	}

	private async OnSaveTreeReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session || !req.session.key)
			return res.status(500).send();

		try 
		{
			await this.loginDataDb.updateOne({ 
				_id: req.session.key.toLowerCase(),
			}, { 
				$set: { family_nodes: req.body.family_nodes }
			});
		}
		catch (err)
		{
			console.error('Error attempting to save family tree:');
			console.error(err);
			return res.status(500).send();
		}

		return res.send();
	}

	private async OnFamilyRequestResponseReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send(); // Is redis running?

			try 
			{
				await this.loginDataDb.updateOne({ 
					_id: req.session.key.toLowerCase(),
				}, { 
					$push: 
					{ 
						approved_family: { $each: req.body.approved }, 
						disapproved_family: { $each: req.body.disapproved }
					}
				});
			}
			catch (err)
			{
				console.error('Error attempting to save family request approvals:');
				console.error(err);
				return res.status(500).send();
			}
		
		return res.send();		
	}

	private async OnLogoutReq(req: express.Request, res: express.Response): Promise<express.Response>
	{
		if (!req.session)
			return res.status(500).send();

		req.session.destroy(() => res.send());
	}

	// From https://gist.github.com/jed/982883
	private GenerateUuid(): string
	{
		return (([1e7] as any + -1e3 + -4e3 + -8e3 + -1e11) as string).replace(/[018]/g, c =>
			(c as any ^ crypto.randomBytes(1)[0] % 16 >> (c as any) / 4).toString(16),
		);
	}
}

// Start Server
const familyHealthHistoryServer = new FamilyHealthHistoryServer();

enum AuthenticationStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error,
}
