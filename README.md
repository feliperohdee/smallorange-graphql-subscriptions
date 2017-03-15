[![CircleCI](https://circleci.com/gh/feliperohdee/smallorange-graphql-subscriptions.svg?style=svg)](https://circleci.com/gh/feliperohdee/smallorange-graphql-subscriptions)

# Small Orange GraphQL Subscriptions Manager

## Wht it does

This is a simple GraphQl subscriptions manager, it takes care to group similar queries which belongs to same namespace, type and variables, runs with maximum concurrency (thank u rxjs again), and dispatch data via stream.

## Wht is doesn't

It doesn't take care subscribe to your pub/sub mechanism, you should do it by yourself and call run when some event happens, this way, you have freedom to choose the best implementation type for your app. If u're using Redis, you shouldn't create a channel for each event type, instead, you cant just pass an object along with this info, redis is very sensitive with many channels, so, it avoids CPU and memory overhead at Redis machine ;), if you don't know how to do this, you should study more.

It doesn't take care to broadcast messages to right subscribers, it just broadcast, at this way, you can plug in your custom ACL implementation to keep with a single point of truthness, if you don't have one you can use our beloved https://github.com/feliperohdee/smallorange-acl and be happy.

## Important

Subscribers are objects that you intend to send messages afterwards, this lib takes care to manage internal subscriptions state, but once one subscriber is removed (eg. a WebSocket client's close event) you should call unsubscribe(subscriber) manually to remove remove subscribed queries for there;

## API
		stream: Observable<{
			args: object,
			hash: string,
			namespace: string,
			operationName: string,
			query: object,
			root: object,
			rootName: string,
			subscribers: Set,
			type: string
		}>;
		constructor(schema: GraphQLSchema, concurrency: Number = Number.MAX_SAFE_INTEGER);
		run(namespace: string, type: string, root?: object = {}, context?: object = {}): void;
		subscribe(subscriber: object, namespace: string, type: string, variables?: object = {}): string (subscription hash);
		unsubscribe(subscriber: object, namespace?: string, type?: string, hash?: string): void;

## Sample

		const GraphqlSubscriptions = require('smallorange-graphql-subscriptions');
		const schema = new GraphQLSchema({
		    query: new GraphQLObjectType({
		        name: 'QueryType',
		        fields: {
		            user: {
		                type: UserType
		            }
		        }
		    }),
		    subscription: new GraphQLObjectType({
		        name: 'SubscriptionType',
		        fields: {
		            user: {
		                type: UserType,
		                args: {
		                    age: {
		                        type: GraphQLInt
		                    },
		                    city: {
		                        type: GraphQLString
		                    },
		                    name: {
		                        type: GraphQLString
		                    }
		                },
		                resolve: (root, args) => {
		                    return Object.assign({}, root, args);
		                }
		            }
		        }
		    })
		});

		const subscriptions = new GraphqlSubscriptions(schema, 10); // 10 is max concurrency
		const query = `subscription($name: String!, $age: Int, $city: String) {
		        user(name: $name, age: $age, city: $city) {
		            name
		            city
		            age
		        }
		    }`;
		
		const pseudoSubscriber = {
			send(data){
				// send
			}
		};
		const subscriptionHash = subscriptions.subscribe(pseudoSubscriber, 'myNamespace', 'addComment', query);

		graphqlSubscriptions.stream
		    .subscribe(({
		    		operationName,
		    		query,
		    		root,
		    		subscribers,
		    		type
		    	}) => {
		    		subscribers.forEach(subscriber => subscriber.send({
		    			operationName,
		    			query,
		    			root,
		    			type
		    		}));
	    		});

	   graphqlSubscriptions.run(namespace, type, {
	        age: 20
	    });

		// is gonna send to all subscribers
		//
		// {
		//	   operationName: 'addComment',
		//     query: {
		//         data: {
		//             user: {
		//                 age: 20,
		//                 city: null,
		//                 name: 'Rohde'
		//             }
		//         }
		//     },
		//     root: {
		//         age: 20
		//     },
		//     type: 'type'
		// }

		subscriptions.unsubscribe(pseudoSubscriber, 'addComment', 'myNamespace', subscriptionHash);

## Sample with Redis, Websocket, and ACL

		const Acl = require('smallorange-acl');
		const {
			Redis
		} = require('smallorange-redis-client');

		const redis = new Redis();
		const wss = StandaloneWebSocketServer();
		const acl = new Acl({
			push: {
				commentAdded: {
					public: {
						type: 'conditionExpression',
						expression: ({
								namespace,
								root
							}, auth) => {
							return namespace === auth.namespace && root.id === auth.id;
						}
					}
				}
			}
		});

		const aclContexts = {
			comentAdded: acl.get('push.commentAdded')
		};

		redis.onChannel('updateStream', ({
			namespace,
			type,
			data
		}) => {
			graphqlSubscriptions.run(namespace, type, data);
		});

		graphqlSubscriptions.stream
				.mergeMap(({
					hash,
					namespace,
					query,
					root,
					subscribers,
					type
				}) => {
					return Observable.from(subscribers)
						.mergeMap(subscriber => {
							return aclContexts.comentAdded({ // or aclContexts[type]
								namespace,
								root
							}, subscriber.auth, {
								rejectSilently: true
							})
							.mapTo({
								subscriber,
								query
							});
						})
						.do(({
							subscriber,
							query
						}) => {
							subscriber.send(query);
						});
				})
				.retryOn(err => 
					err.delay(100)
				)
				.publish()
				.connect();


