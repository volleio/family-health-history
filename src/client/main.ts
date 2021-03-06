import { stringify } from "querystring";

declare var OrgChart: any;
declare var Def: any;

class FamilyHealthHistoryClient {
	private mainContainer: HTMLElement;

	// Login Help
	private loginHelpSpinner = document.querySelector('.login-help-spinner') as HTMLElement;
	private currentHelpTextState: HelpStates = null;
	private isLoginHelpPrimary = true;
	private loginContainer = document.querySelector('.login-container') as HTMLElement;
	private loginHelp = this.loginContainer.querySelector('.login-help') as HTMLElement;
	private loginHelpText1 = this.loginContainer.querySelector('.login-help-text__1') as HTMLElement;
	private loginHelpText2 = this.loginContainer.querySelector('.login-help-text__2') as HTMLElement;
	private loginHelpExtra = this.loginContainer.querySelector('.login-help-extra') as HTMLElement;

	private loginButton = this.loginContainer.querySelector('.login-button') as HTMLElement;
	private loginInput = document.getElementById('login-input') as HTMLInputElement;
	private loginAuthBadge = this.loginContainer.querySelector('.login-auth-badge') as HTMLElement;
	private loginAuthBadgeCheck = this.loginAuthBadge.querySelector('.login-auth-badge__check') as HTMLElement;
	
	private loginId = '';

	// Family tree
	private familyTreeNodes: any[];
	private familyTree: any;

	constructor() 
	{
		this.Initialize();
	}

	private Initialize()
	{
		// window.addEventListener("mousemove", (evt) => {
		// 	const logoImg = document.querySelector(".logo") as HTMLElement;
		// 	const logoImgRect = logoImg.getBoundingClientRect();
		// 	const centerX = logoImgRect.left + (logoImgRect.right - logoImgRect.left) * 0.5;
		// 	const centerY = logoImgRect.top + (logoImgRect.bottom - logoImgRect.top) * 0.5;
		// 	const x = (centerX - evt.clientX) / 10;
		// 	const y = (centerY - evt.clientY) / 20  * -1;
		// 	logoImg.style.transform = `translate(-50%) rotate3d(1, 0, 0, ${y}deg) rotate3d(0, 1, 0, ${x}deg)`;
		// });

		this.loginInput.addEventListener('keydown', (evt) => 
		{
			requestAnimationFrame(() => 
			{
				if (this.loginInput.value.length <= 8) 
				{
					this.UpdateLoginHelp(false, false, HelpStates.EnterEmail, "Please enter your email to log in",	"");
					const loginHelpCurrent = this.isLoginHelpPrimary ? this.loginHelpText1 : this.loginHelpText2;
					loginHelpCurrent.style.opacity = (1 - this.loginInput.value.length / 12).toString();
				} 
				else
				{
					this.UpdateLoginHelp(false, true, HelpStates.Login, "Login");
				}
			});
		});

		this.loginInput.addEventListener('keydown', (evt) => { if (evt.key === 'Enter') this.SubmitLogin(); });
		this.loginButton.addEventListener('click', () => this.SubmitLogin());

		// Transition from loading to login screen
		const mainSpinner = document.getElementById('main-spinner');
		mainSpinner.style.opacity = '0';
		mainSpinner.style.transform = 'scale(0)';

		this.mainContainer = document.getElementById('main-container');
		this.mainContainer.style.opacity = '1';

		this.loginInput.focus();

		// Prompt the user to enter their email
		this.UpdateLoginHelp(false, false, HelpStates.Login, "Please enter your email to log in",	"");

		this.loginHelpText1.addEventListener('mouseover', () => this.OnLoginHelpMouseOver());
		this.loginHelpText1.addEventListener('mouseout', () => this.OnLoginHelpMouseOut());
		this.loginHelpText2.addEventListener('mouseover', () => this.OnLoginHelpMouseOver());
		this.loginHelpText2.addEventListener('mouseout', () => this.OnLoginHelpMouseOut());
	}

	private async SubmitLogin(): Promise<void>
	{
		this.UpdateLoginHelp(true, true, null, '');
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute('disabled', '');
		this.loginButton.setAttribute('disabled', '');
		
		let loginResult;
		try
		{
			loginResult = await (await fetch('/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					loginId: loginValue,
				}),
			})).json();
		}
		catch (err)
		{
			console.error(err);
			loginResult = { authenticationStatus: AuthenticationStatus.error };
		}

		switch (loginResult.authenticationStatus)
		{
		case AuthenticationStatus.success:
			this.OnLoginSuccess(loginValue, loginResult.family_nodes, loginResult.familyRequests);
			break;

		case AuthenticationStatus.userNotFound:
			this.OnUserNotFound(loginValue);
			break;

		case AuthenticationStatus.failure:
			this.loginInput.removeAttribute('disabled');
			this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, "Login failed, please try again.");
			break;

		case AuthenticationStatus.error:
		default:
			this.loginInput.removeAttribute('disabled');
			this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, "Login failed, please try again.");
			break;
		}
	}

	private OnUserNotFound(loginId: string): void
	{
		const userNotFoundElements = document.createElement('div');
		userNotFoundElements.className = 'login-help-with-button';
		userNotFoundElements.innerText = "User not found, would you like to create an account?";
		
		const userNotFoundButtonContainer = document.createElement('div');
		userNotFoundButtonContainer.className = 'login-help-buttons';
		userNotFoundElements.appendChild(userNotFoundButtonContainer);

		const createAccountButton = document.createElement('button');
		createAccountButton.className = 'primary-button';
		createAccountButton.innerText = "Create Account";
		createAccountButton.addEventListener('click', (evt) => 
		{
			this.loginId = loginId;
			this.CreateAccount();
		});
		
		const cancelButton = document.createElement('button');
		cancelButton.className = 'secondary-button';
		cancelButton.innerText = "Cancel";
		cancelButton.addEventListener('click', (evt) => 
		{
			this.loginInput.removeAttribute('disabled');
			this.loginInput.focus();
			this.loginInput.value = '';
			this.UpdateLoginHelp(false, false, HelpStates.EnterEmail, "Please enter your email to log in");
		});

		userNotFoundButtonContainer.appendChild(createAccountButton);
		userNotFoundButtonContainer.appendChild(cancelButton);

		this.UpdateLoginHelp(false, false, HelpStates.UserNotFound, userNotFoundElements);
	}

	private async CreateAccount(): Promise<void>
	{
		this.UpdateLoginHelp(true, true, null, '');
		const loginValue = this.loginInput.value;
		this.loginInput.setAttribute('disabled', '');
		this.loginButton.setAttribute('disabled', '');

		let createAccountResult;
		try
		{
			createAccountResult = await (await fetch('/create-account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
				}),
			})).json();
		}
		catch (err)
		{
			console.error(err);
			createAccountResult = { authenticationStatus: AuthenticationStatus.error };
		}

		switch (createAccountResult.authenticationStatus)
		{
		case AuthenticationStatus.success:
			this.OnLoginSuccess(loginValue, [], createAccountResult.familyRequests);
			break;

		case AuthenticationStatus.failure:
			this.loginInput.removeAttribute('disabled');
			this.UpdateLoginHelp(false, false, HelpStates.FailedLogin, "Login failed, please try again.");			
			break;

		case AuthenticationStatus.error:
		default:
			this.loginInput.removeAttribute('disabled');
			this.UpdateLoginHelp(false, false, HelpStates.ErrorLogin, "Login failed, please try again.");
			break;
		}
	}

	private UpdateLoginHelp(showSpinner: boolean, showButton: boolean, helpTextState: HelpStates,
		help: string | HTMLElement, extraHelpText?: string): void
	{
		if (showSpinner) 
			this.loginHelpSpinner.style.display = 'block';
		else 
			this.loginHelpSpinner.style.display = '';

		let loginHelpCurrent: HTMLElement;
		let loginHelpHidden: HTMLElement;
		if (this.isLoginHelpPrimary)
		{
			loginHelpCurrent = this.loginHelpText1;
			loginHelpHidden = this.loginHelpText2;
		}
		else
		{
			loginHelpCurrent = this.loginHelpText2;
			loginHelpHidden = this.loginHelpText1;
		}

		loginHelpCurrent.style.opacity = '0';
		loginHelpCurrent.style.pointerEvents = 'none';
		loginHelpHidden.style.opacity = '1';
		loginHelpHidden.style.pointerEvents = 'all';

		if (showButton) 
		{
			this.loginButton.style.opacity = '1';
			this.loginButton.style.pointerEvents = 'all';
			this.loginHelp.style.pointerEvents = 'none';
			loginHelpHidden.style.pointerEvents = 'none';
		}
		else
		{
			this.loginButton.style.opacity = '0';
			this.loginButton.style.pointerEvents = 'none';
			this.loginHelp.style.pointerEvents = 'all';
		}

		if (typeof help === 'string')
		{
			loginHelpHidden.innerHTML = help;
		}
		else
		{
			loginHelpHidden.innerHTML = '';
			loginHelpHidden.appendChild(help);
		}

		if (extraHelpText)
		{
			const extraHelpQuestionMark = document.createElement('span');
			extraHelpQuestionMark.className = 'login-help-extra-question-mark';
			extraHelpQuestionMark.innerHTML = "";
			loginHelpHidden.appendChild(extraHelpQuestionMark);

			this.loginHelpExtra.innerHTML = extraHelpText;
		}
		else
		{
			this.loginHelpExtra.innerHTML = '';
		}

		this.currentHelpTextState = helpTextState;
		this.isLoginHelpPrimary = !this.isLoginHelpPrimary;
	}

	private OnLoginHelpMouseOver(): void 
	{		
		this.loginHelpExtra.style.display = 'block';
		const loginHelpHeight = this.isLoginHelpPrimary ? this.loginHelpText1.offsetHeight : this.loginHelpText2.offsetHeight;
		this.loginHelpExtra.style.marginTop = `${loginHelpHeight + 8}px`;
		this.loginHelpExtra.style.opacity = '1';
	}

	private OnLoginHelpMouseOut(): void 
	{
		this.loginHelpExtra.style.opacity = '0';
	}

	private OnLoginSuccess(loginId: string, familyTreeNodes = [], familyRequests: any): void
	{
		this.loginId = loginId;
		this.UpdateLoginHelp(false, false, null, '');
		this.loginHelp.style.display = 'none';
		this.loginButton.style.display = 'none';
		this.loginContainer.classList.add('login-container--logged-in');
		this.loginInput.classList.add('login-input--logged-in');
		(document.querySelector(".logo.hands") as HTMLElement).style.opacity = "1";

		window.setTimeout(() =>
		{
			document.querySelector(".logo.tree").classList.add("logged-in");
			document.querySelector(".logo.hands").classList.add("logged-in");
			(document.querySelector(".logo.hands") as HTMLElement).style.opacity = "";
	}, 1000);
		
		this.loginAuthBadge.style.display = 'block';
		this.loginAuthBadgeCheck.classList.add('animate-in');

		// Set up main menu
		const mainMenu = this.loginContainer.querySelector('.main-menu') as HTMLElement;
		mainMenu.style.display = 'flex';
		requestAnimationFrame(() => mainMenu.style.opacity = '1');
		
		this.loginContainer.addEventListener('mouseenter', () =>
		{
			this.loginContainer.style.height = `${this.loginContainer.scrollHeight}px`;
		});
		
		this.loginContainer.addEventListener('mouseleave', () =>
		{
			this.loginContainer.style.height = '';
		});
		
		const logoutButton = mainMenu.querySelector('.logout-button') as HTMLElement;
		logoutButton.innerHTML = "Log out";
		logoutButton.addEventListener('click', async () =>
		{
			await fetch('/logout');
			location.reload();
		});
		
		this.SetUpFamilyTree(familyTreeNodes);

		if (familyRequests && familyRequests.length > 0)
		{
			let approvedReqs = [];
			let disapprovedReqs = [];
			familyRequests.forEach(request => {
				if ((request._id as string).toLowerCase() != this.loginId.toLowerCase())
				{
					if (window.confirm(`${request._id} has requested your medical information, would you like to share it with them?`))
						approvedReqs.push(request._id);
					else
						disapprovedReqs.push(request._id);
				}
			});

			fetch('/family-request-response', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					approved: approvedReqs,
					disapproved: disapprovedReqs,
				}),
			});
		}
	}

	private SetUpFamilyTree(familyTreeNodes: any[]): void
	{
		
		const familyGroupTag = {
			group: true,
			template: "group_grey",
			groupState: OrgChart.EXPAND
		};

		OrgChart.templates.diva2 = Object.assign({}, OrgChart.templates.diva);
		OrgChart.templates.diva2.html = '<foreignobject class="node" x="0" y="176" width="1" height="1" style="overflow: visible;">{val}</foreignobject>';

		OrgChart.templates.empty = Object.assign({}, OrgChart.templates.base);
		OrgChart.templates.empty.size = [0, 0];
		OrgChart.templates.empty.node = '';
		OrgChart.templates.empty.plus = '';
		OrgChart.templates.empty.minus = '';
		OrgChart.templates.empty.img_0 = '';

		OrgChart.templates.root = Object.assign({}, OrgChart.templates.diva2);
		OrgChart.templates.root.link = '';

		OrgChart.templates.emptyroot = Object.assign({}, OrgChart.templates.empty);
		OrgChart.templates.emptyroot.link = '';

		const defaultNodes = !this.loginId.toLowerCase().startsWith("morty") 
		? 
		[
			{ id: 1, pid: "", spids: "", Name: "", Relation: "You", img: "/images/avatar.png", "Medical Conditions": "", "Email": this.loginId },
		]
		:
		[
			{"id":9,"pid":3,"spids":[5],"Name":"Leonard Smith","Relation":"Paternal Grandfather","img":"https://vignette.wikia.nocookie.net/rickandmorty/images/7/74/Leonard_Smith.png/revision/latest?cb=20140421044137","Medical Conditions":"","Email":""},
			{"id":8,"pid":3,"spids":[5],"Name":"Joyce Smith","Relation":"Paternal Grandmother","img":"https://rickandmortyapi.com/api/character/avatar/186.jpeg","Medical Conditions":"","Email":""},
			{"id":7,"pid":4,"Name":"Rick Sanchez","Relation":"Maternal Grandfather","img":"https://vignette.wikia.nocookie.net/rickandmorty/images/a/a6/Rick_Sanchez.png/revision/latest?cb=20160923150728","Medical Conditions":"","Email":""},
			{"id":6,"pid":4,"Name":"Mrs. Sanchez","Relation":"Maternal Grandmother","img":"/images/avatar.png","Medical Conditions":"","Email":""},
			{"id":5,"pid":0,"Name":"Steve Smith","Relation":"\"Uncle\"","img":"https://vignette.wikia.nocookie.net/rickandmorty/images/5/50/UncleSteve.png/revision/latest?cb=20150823180126","Medical Conditions":"","Email":""},
			{"id":4,"pid":1,"spids":[2],"Name":"Beth Smith","Relation":"Mom","img":"https://vignette.wikia.nocookie.net/rickandmorty/images/b/be/Screenshot_2016-11-20_at_6.54.33_PM.png/revision/latest?cb=20161121033552","Medical Conditions":"","Email":""},
			{"id":3,"pid":1,"spids":[2],"Name":"Jerry Smith","Relation":"Dad","img":"https://pbs.twimg.com/profile_images/738078769920020481/xpW4r-Tr_400x400.jpg","Medical Conditions":"","Email":""},
			{"id":2,"Name":"Summer Smith","Relation":"Sister","img":"https://vignette.wikia.nocookie.net/rickandmorty/images/a/ad/Summer_is_cool.jpeg/revision/latest?cb=20160919183158","Medical Conditions":"","Email":""},
			{"id":1,"Name":"Morty Smith","Relation":"You","img":"https://i.imgur.com/9NGko96.gif","Medical Conditions":"","Email":"morty@optonline.net"},
			{"id":0,"tags":["emptyroot"]}
		];

		

		this.familyTree = new OrgChart(document.getElementById("tree"), {
			template: "diva2",
			enableDragDrop: false,
			zoom: {
                speed: 20,
                smooth: 2
			},
			scaleMin: 0.25,
			scaleMax: 2,
			scaleInitial: 0.7,
			levelSeparation: 200,
			orientation: OrgChart.orientation.bottom,
			// orientation: OrgChart.orientation.top,
			layout: OrgChart.normal,
			toolbar: {
                layout: false,
                zoom: true,
                fit: false,
                expandAll: false
            },
			nodeMouseClick: OrgChart.action.edit,
			menu: {
				svg: { text: "Export SVG" },
				csv: { text: "Export CSV" },
				pdf: { text: "Export PDF" },
			},
			nodeMenu:{
            	add: {
					text:"Add Parent",
					icon: () => '<svg width="24px" height="24px"   viewBox="0 0 922 922"><path fill="#7A7A7A" d="M922,453V81c0-11.046-8.954-20-20-20H410c-11.045,0-20,8.954-20,20v149h318c24.812,0,45,20.187,45,45v198h149 C913.046,473.001,922,464.046,922,453z" /><path fill="#7A7A7A" d="M557,667.001h151c11.046,0,20-8.954,20-20v-174v-198c0-11.046-8.954-20-20-20H390H216c-11.045,0-20,8.954-20,20v149h194 h122c24.812,0,45,20.187,45,45v4V667.001z" /><path fill="#7A7A7A" d="M0,469v372c0,11.046,8.955,20,20,20h492c11.046,0,20-8.954,20-20V692v-12.501V667V473v-4c0-11.046-8.954-20-20-20H390H196 h-12.5H171H20C8.955,449,0,457.955,0,469z" /></svg>',
					onClick: (nodeId) =>
					{
						const nextId = this.GetNextNodeId();
						const newNode: any = { id: nextId, pid: nodeId, spids: "", Name: "", Relation: "", img: "/images/avatar.png", "Medical Conditions": "", "Email": "" };
						const currentTree = JSON.stringify(this.familyTree.config.nodes);
						try
						{
							this.familyTree.addNode(newNode);
						}
						catch (error)
						{
							this.familyTree.config.nodes = JSON.parse(currentTree);
						}
					}
				},
            	// addSibling: {
				// 	text:"Add Sibling",
				// 	icon: () => '<svg width="24px" height="24px"   viewBox="0 0 922 922"><path fill="#7A7A7A" d="M922,453V81c0-11.046-8.954-20-20-20H410c-11.045,0-20,8.954-20,20v149h318c24.812,0,45,20.187,45,45v198h149 C913.046,473.001,922,464.046,922,453z" /><path fill="#7A7A7A" d="M557,667.001h151c11.046,0,20-8.954,20-20v-174v-198c0-11.046-8.954-20-20-20H390H216c-11.045,0-20,8.954-20,20v149h194 h122c24.812,0,45,20.187,45,45v4V667.001z" /><path fill="#7A7A7A" d="M0,469v372c0,11.046,8.955,20,20,20h492c11.046,0,20-8.954,20-20V692v-12.501V667V473v-4c0-11.046-8.954-20-20-20H390H196 h-12.5H171H20C8.955,449,0,457.955,0,469z" /></svg>',
				// 	onClick: (nodeId) =>
				// 	{
				// 		const node = this.familyTree.get(nodeId);
				// 		const parents = this.familyTree.config.nodes.filter((n) => n.pid === node.id);

				// 		const nextId = this.GetNextNodeId();
				// 		const newNode: any = { id: nextId, pid: "", spids: "", Name: "", Relation: "", img: "/images/avatar.png", "Medical Conditions": "", "Email": "" };
				// 		// if (node.pid)
				// 		// 	newNode.pid = 0;

				// 		parents.forEach(parent => {
				// 			if (!parent.spids)
				// 				parent.spids = [];
							
				// 			parent.spids.push(newNode.id);
				// 		});

				// 		const currentTree = JSON.stringify(this.familyTree.config.nodes);
				// 		try
				// 		{
				// 			this.familyTree.addNode(newNode);
				// 		}
				// 		catch (error)
				// 		{
				// 			this.familyTree.config.nodes = JSON.parse(currentTree);
				// 		}
				// 	}
				// },
            	remove: {text:"Remove"}
            },
			nodeBinding: {
				field_0: "Name",
				field_1: "Relation",
				html: (sender, node) => 
				{
					if (!sender.get(node.id)["Medical Conditions"])
						return "";

					const conditions = JSON.parse(sender.get(node.id)["Medical Conditions"]);
					if (conditions && conditions.length > 0 && conditions.some((el: IMedicalCondition) => !el.locked))
					{
						let html = `<div class="condition-list" onwheel="event.stopImmediatePropagation();"><div class="paper"><ul>`
						conditions.forEach((el: IMedicalCondition) => {
							if (!el.locked)
							{
								html += `<li>${el.icd10Code} <i>${el.icd10Text}</i></li>`
							}
						});
						html += `</ul></div></div>`
						return html;
					}
					return "";
				},
				img_0: "img"
			},
			tags: {
				f1: familyGroupTag,
				f2: familyGroupTag,
				f3: familyGroupTag,
				f4: familyGroupTag,
				f5: familyGroupTag,
				empty: { template: 'empty' },
				emptyroot: { template: 'emptyroot' },
				root: { template: 'root' },
			},
			nodes: familyTreeNodes.length > 0 ? familyTreeNodes : defaultNodes,
		});

		this.familyTree.on('click', (sender, node) =>
		{
			window.setTimeout(() => 
			{
				console.log(sender);
				console.log(node);

				const medicalConditionsSection = sender.editUI.wrapperElement.querySelector('[label="Medical Conditions"]').parentElement;
				const medicalConditionsInput = medicalConditionsSection.querySelector("input");
				medicalConditionsSection.querySelector("hr").style.display = "none";
				medicalConditionsInput.style.display = "none";

				const medicalConditionSearch = document.createElement("input") as any;
				medicalConditionSearch.type	= "text";
				medicalConditionSearch.id = "condition";
				medicalConditionSearch.className = "condition-search";
				medicalConditionsSection.appendChild(medicalConditionSearch);
				
				const medicalConditionsContainer = document.createElement("div");
				medicalConditionsSection.appendChild(medicalConditionsContainer);

				if (!node["Medical Conditions"] || node["Medical Conditions"] === "")
						node["Medical Conditions"] = "[]";

				const medicalConditions = JSON.parse(node["Medical Conditions"]) as IMedicalCondition[];

				this.UpdateMedicalConditionsUI(medicalConditions, medicalConditionsContainer, (name) =>
				{
					let newMedicalConditions = (JSON.parse(node["Medical Conditions"]) as IMedicalCondition[]).filter((val) => val.name != name);
					node["Medical Conditions"] = JSON.stringify(newMedicalConditions);
					medicalConditionsInput.value = node["Medical Conditions"];
				}, (name, locked) =>
				{
					let newMedicalConditions = JSON.parse(node["Medical Conditions"]) as IMedicalCondition[];
					newMedicalConditions.find(val => val.name === name).locked = locked;
					node["Medical Conditions"] = JSON.stringify(newMedicalConditions);
					medicalConditionsInput.value = node["Medical Conditions"];
				});

				new Def.Autocompleter.Search('condition', 'https://clinicaltables.nlm.nih.gov/api/conditions/v3/search?ef=consumer_name,icd10cm,info_link_data');

				Def.Autocompleter.Event.observeListSelections('condition', () => {
					if (!medicalConditionSearch.autocomp || !medicalConditionSearch.autocomp.getSelectedItemData() || 
						!medicalConditionSearch.autocomp.getSelectedItemData()[0] || !medicalConditionSearch.autocomp.getSelectedItemData()[0].data)
						return;

					const info = medicalConditionSearch.autocomp.getSelectedItemData()[0].data;

					medicalConditions.push({
						name: info.consumer_name,
						icd10Code: info.icd10cm[0].code,
						icd10Text: info.icd10cm[0].text,
						link: info.info_link_data ? info.info_link_data[0][0] : "",
						linkText: info.info_link_data ? info.info_link_data[0][1] : "",
						locked: false
					});

					this.familyTree.addNodeTag(node.id);
					node["Medical Conditions"] = JSON.stringify(medicalConditions);
					medicalConditionsInput.value = node["Medical Conditions"];

					this.UpdateMedicalConditionsUI(medicalConditions, medicalConditionsContainer, (name) =>
					{
						let newMedicalConditions = (JSON.parse(node["Medical Conditions"]) as IMedicalCondition[]).filter((val) => val.name != name);
						node["Medical Conditions"] = JSON.stringify(newMedicalConditions);
						medicalConditionsInput.value = node["Medical Conditions"];
					}, (name, locked) =>
					{
						let newMedicalConditions = JSON.parse(node["Medical Conditions"]) as IMedicalCondition[];
						newMedicalConditions.find(val => val.name === name).locked = locked;
						node["Medical Conditions"] = JSON.stringify(newMedicalConditions);
						medicalConditionsInput.value = node["Medical Conditions"];
					});
				});
			}, 0);
		});

		this.familyTree.on("update", () => setTimeout(() => this.SaveTreeData(), 0));
		this.familyTree.on("remove", () => setTimeout(() => this.SaveTreeData(), 0));
		this.familyTree.on("add", () => setTimeout(() => this.SaveTreeData(), 0));

		this.familyTree.on('imageuploaded', (file, inputHtmlElement) => {
			console.log(file);
			console.log(inputHtmlElement);
        });  

		window.setTimeout(() =>	document.getElementById("tree").style.opacity = "1", 1500);
	}

	private UpdateMedicalConditionsUI(medicalConditions: IMedicalCondition[], medicalConditionsContainer: HTMLElement, onDelete: (name: string) => void, onLock: (name: string, locked: boolean) => void)
	{
		medicalConditionsContainer.innerHTML = "";
		medicalConditions.forEach((obj, index) => {
			const conditionContainer = document.createElement("div");
			conditionContainer.className = "condition-container";
			conditionContainer.innerHTML = `
			<strong>${obj.name}</strong><i>${obj.icd10Code}: ${obj.icd10Text}</i>
			<br/>
			<a href="${obj.link}" target="_blank">nlm.nih.gov: ${obj.linkText}</a><div class="delete-btn">×</div>
			<div class="lock-btn ${obj.locked ? "locked" : ""}"></div>
			`
			medicalConditionsContainer.appendChild(conditionContainer);
			conditionContainer.querySelector(".delete-btn").addEventListener("click", () => {
				conditionContainer.remove();
				onDelete(obj.name);
			});

			const lockBtn = conditionContainer.querySelector(".lock-btn");
			lockBtn.addEventListener("click", () => {
				if (lockBtn.classList.contains("locked"))
				{
					lockBtn.classList.remove("locked");
					onLock(obj.name, false);
				}
				else
				{
					lockBtn.classList.add("locked");
					onLock(obj.name, true);
				}
			});
		});
	}

	private async SaveTreeData(): Promise<void>
	{
		let saveResult;
		try
		{
			saveResult = await fetch('/save-tree', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					family_nodes: this.familyTree.config.nodes,
				}),
			});
		}
		catch (err)
		{
			console.error(err);
		}
	}

	private GetNextNodeId(): number
	{
		return Math.max.apply(Math, this.familyTree.config.nodes.map((node) => node.id)) + 1;
	}
}

interface IMedicalCondition {
	name: string;
	icd10Code: string,
	icd10Text: string,
	link: string,
	linkText: string,
	locked: boolean
}

enum HelpStates {
	EnterEmail,
	Login,
	UserNotFound,
	CreateAccount,
	FailedLogin,
	ErrorLogin,
}

enum AuthenticationStatus {
	success,
	userNotFound,
	accountCreated,
	accountNotCreated,
	failure,
	error,
}

const familyHealthHistory = new FamilyHealthHistoryClient();
