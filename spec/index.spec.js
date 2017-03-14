const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const lazyExecutor = require('smallorange-graphql-lazy-executor');
const {
    Observable
} = require('rxjs');
const {
    GraphQLSchema,
    GraphQLObjectType,
    GraphQLString,
    GraphQLInt
} = require('graphql');

const GraphqlSubscriptions = require('../');

chai.use(sinonChai);

const callback = sinon.stub();
const expect = chai.expect;
const type = 'type';
const namespace = 'namespace';
const queries = [
    `subscription($name: String!, $age: Int, $city: String) {
        user(name: $name, age: $age, city: $city) {
            name
            city
            age
        }
    }`,
    `subscription($name: String!, $age: Int, $city: String) {
        user(name: $name, age: $age, city: $city) {
            name
            age
        }
    }`
];

const UserType = new GraphQLObjectType({
    name: 'UserType',
    fields: {
        age: {
            type: GraphQLInt
        },
        city: {
            type: GraphQLString
        },
        name: {
            type: GraphQLString
        }
    }
});

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

const noSubscriptionSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
        name: 'QueryType',
        fields: {
            user: {
                type: UserType
            }
        }
    })
});

describe('index.js', () => {
    let graphqlSubscriptions;

    beforeEach(() => {
        graphqlSubscriptions = new GraphqlSubscriptions(schema);
    });

    describe('constructor', () => {
        it('should throw if no schema', () => {
            expect(() => new GraphqlSubscriptions()).to.throw('No GraphQL schema provided');
        });

        it('should feed schema', () => {
            expect(graphqlSubscriptions.schema).to.be.defined;
        });

        it('should feed default concurrency', () => {
            expect(graphqlSubscriptions.concurrency).to.equal(Number.MAX_SAFE_INTEGER);
        });

        it('should feed custom concurrency', () => {
            graphqlSubscriptions = new GraphqlSubscriptions(schema, 4);
            expect(graphqlSubscriptions.concurrency).to.equal(4);
        });

        it('should feed stream', () => {
            expect(graphqlSubscriptions.stream).to.be.defined;
        });
    });

    describe('run', () => {
        beforeEach(() => {
            sinon.spy(graphqlSubscriptions.inbound, 'next');
        });

        afterEach(() => {
            graphqlSubscriptions.inbound.next.restore();
        });

        it('should call inbound.next with default root', () => {
            graphqlSubscriptions.run(type, namespace);
            expect(graphqlSubscriptions.inbound.next).to.have.been.calledWith({
                type,
                namespace,
                root: {}
            });
        });

        it('should call inbound.next with custom root', () => {
            graphqlSubscriptions.run(type, namespace, {
                root: 'root'
            });
            expect(graphqlSubscriptions.inbound.next).to.have.been.calledWith({
                type,
                namespace,
                root: {
                    root: 'root'
                }
            });
        });

        describe('stream', () => {
            it('should do nothing if no type', done => {
                const result = [];

                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.stream
                    .timeoutWith(10, Observable.empty())
                    .subscribe(result.push.bind(result), null, () => {
                        expect(result).to.deep.equal([]);
                        done();
                    });

                graphqlSubscriptions.run();
            });

            it('should do nothing if no namespace', done => {
                const result = [];

                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.stream
                    .timeoutWith(10, Observable.empty())
                    .subscribe(result.push.bind(result), null, () => {
                        expect(result).to.deep.equal([]);
                        done();
                    });

                graphqlSubscriptions.run(type);
            });

            it('should do nothing if type not found', done => {
                const result = [];

                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.stream
                    .timeoutWith(10, Observable.empty())
                    .subscribe(result.push.bind(result), null, () => {
                        expect(result).to.deep.equal([]);
                        done();
                    });

                graphqlSubscriptions.run(type + 1, namespace);
            });

            it('should do nothing if namespace not found', done => {
                const result = [];

                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.stream
                    .timeoutWith(10, Observable.empty())
                    .subscribe(result.push.bind(result), null, () => {
                        expect(result).to.deep.equal([]);
                        done();
                    });

                graphqlSubscriptions.run(type, namespace + 1);
            });

            it('should handle query error', done => {
                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1]);

                graphqlSubscriptions.stream
                    .subscribe(null, err => {
                        expect(err.message).to.equal('Variable "$name" of required type "String!" was not provided.');
                        done();
                    });

                graphqlSubscriptions.run(type, namespace);
            });

            it('should run queries', done => {
                const result = [];

                graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type + 1, namespace, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.subscribe(type, namespace + 1, queries[1], {
                    name: 'Rohde'
                });

                graphqlSubscriptions.stream
                    .take(3)
                    .toArray()
                    .subscribe(response => {
                        expect(response).to.deep.equal([{
                            hash: '1b3ba0c92a4934816488a5a7046a6e43',
                            namespace: 'namespace',
                            query: {
                                data: {
                                    user: {
                                        age: 20,
                                        city: null,
                                        name: 'Rohde'
                                    }
                                }
                            },
                            root: {
                                age: 20
                            },
                            type: 'type'
                        }, {
                            hash: '44ecdc2ef39fc8d30ee95e576945dc99',
                            namespace: 'namespace',
                            query: {
                                data: {
                                    user: {
                                        age: 20,
                                        name: 'Rohde'
                                    }
                                }
                            },
                            root: {
                                age: 20
                            },
                            type: 'type'
                        }, {
                            hash: '44ecdc2ef39fc8d30ee95e576945dc99',
                            namespace: 'namespace1',
                            query: {
                                data: {
                                    user: {
                                        age: 20,
                                        name: 'Rohde'
                                    }
                                }
                            },
                            root: {
                                age: 20
                            },
                            type: 'type'
                        }]);
                    }, null, done);

                graphqlSubscriptions.run(type, namespace, {
                    age: 20
                });

                graphqlSubscriptions.run(type, namespace + 1, {
                    age: 20
                });
            });
        });
    });

    describe('subscribe', () => {
        beforeEach(() => {
            sinon.spy(graphqlSubscriptions, 'extractQueryData');
        });

        afterEach(() => {
            graphqlSubscriptions.extractQueryData.restore();
        });

        it('should do nothing if no type', () => {
            expect(graphqlSubscriptions.subscribe()).to.be.undefined;
            expect(graphqlSubscriptions.extractQueryData).not.to.have.been.called;
        });

        it('should do nothing if no namespace', () => {
            expect(graphqlSubscriptions.subscribe(type)).to.be.undefined;
            expect(graphqlSubscriptions.extractQueryData).not.to.have.been.called;
        });

        it('should do nothing if no query', () => {
            expect(graphqlSubscriptions.subscribe(type, namespace)).to.be.undefined;
            expect(graphqlSubscriptions.extractQueryData).not.to.have.been.called;
        });

        it('should return hash based on query and variables', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub2 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub3 = graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                age: 20
            });

            const sub4 = graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                age: 21
            });

            expect(sub1).to.equal('f8fbde9910298bf4e3592fc3d76b240b');
            expect(sub2).to.equal('f8fbde9910298bf4e3592fc3d76b240b');
            expect(sub3).to.equal('cd204de2f608702a33c9b18db0b073dd');
            expect(sub4).to.equal('96959aceab862f034080a17c9adce40c');
            expect(sub1).to.equal(sub2);
            expect(sub2).not.to.equal(sub3);
            expect(sub3).not.to.equal(sub4);
        });

        it('should create subscriptionsByType', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            expect(graphqlSubscriptions.subscriptionsByType.get(type)).to.be.a('Map');
            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub1)).to.be.a('function');
        });

        it('should group subscriptionsByType with same types', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub2 = graphqlSubscriptions.subscribe(type + 1, namespace, queries[0], {
                age: 21
            });

            const sub3 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 22
            });

            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub1)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.get(type + 1).get(namespace).get(sub2)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub3)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.size).to.equal(2);
        });

        it('should group subscriptionsByType with same namespaces', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub2 = graphqlSubscriptions.subscribe(type, namespace + 1, queries[0], {
                age: 21
            });

            const sub3 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 22
            });

            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub1)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace + 1).get(sub2)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub3)).to.be.a('function');
            expect(graphqlSubscriptions.subscriptionsByType.get(type).size()).to.equal(2);
        });

        it('should group same queries with same variables', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub2 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub3 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub1)).to.equal(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).get(sub3));
            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).size).to.equal(1);
        });

        it('should not group different queries', () => {
            const sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0], {
                age: 20
            });

            const sub2 = graphqlSubscriptions.subscribe(type, namespace, queries[1], {
                age: 20
            });

            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).size).to.equal(2);
        });
    });

    describe('unsubscribe', () => {
        let sub1;
        let sub2;
        let sub3;

        beforeEach(() => {
            sub1 = graphqlSubscriptions.subscribe(type, namespace, queries[0]);
            sub2 = graphqlSubscriptions.subscribe(type, namespace, queries[1]);
            sub3 = graphqlSubscriptions.subscribe(type, namespace + 1, queries[0]);
            sinon.spy(graphqlSubscriptions.subscriptionsByType, 'delete');
        });

        afterEach(() => {
            graphqlSubscriptions.subscriptionsByType.delete.restore();
        });

        it('should do nothing if no type', () => {
            expect(graphqlSubscriptions.unsubscribe()).to.be.undefined;
            expect(graphqlSubscriptions.subscriptionsByType.delete).not.to.have.been.called;
        });

        it('should do nothing if no namespace', () => {
            expect(graphqlSubscriptions.unsubscribe(type)).to.be.undefined;
            expect(graphqlSubscriptions.subscriptionsByType.delete).not.to.have.been.called;
        });

        it('should do nothing if no hash', () => {
            expect(graphqlSubscriptions.unsubscribe(type, namespace)).to.be.undefined;
            expect(graphqlSubscriptions.subscriptionsByType.delete).not.to.have.been.called;
        });

        it('should do nothing if no subscriptions', () => {
            graphqlSubscriptions.unsubscribe('inexistent', namespace, sub1);
            expect(graphqlSubscriptions.subscriptionsByType.delete).not.to.have.been.called;
        });

        it('should unsubscribe sub1', () => {
            graphqlSubscriptions.unsubscribe(type, namespace, sub1);

            expect(graphqlSubscriptions.subscriptionsByType.get(type).get(namespace).has(sub1)).to.be.false;
        });

        it('should remove namespace when there is no subscriptions', () => {
            graphqlSubscriptions.unsubscribe(type, namespace + 1, sub3);

            expect(graphqlSubscriptions.subscriptionsByType.get(type).has(namespace + 1)).to.be.false;
        });

        it('should remove type when there is no subscriptions', () => {
            graphqlSubscriptions.unsubscribe(type, namespace, sub1);
            graphqlSubscriptions.unsubscribe(type, namespace, sub2);
            graphqlSubscriptions.unsubscribe(type, namespace + 1, sub3);

            expect(graphqlSubscriptions.subscriptionsByType.has(type)).to.be.false;
        });
    });

    describe('extractQueryData', () => {
        it('should extract query data', () => {
            const executor = lazyExecutor(schema, queries[0]);

            expect(graphqlSubscriptions.extractQueryData(schema, executor.parsedQuery, {
                name: 'Rohde',
                age: 20,
                city: 'San Francisco',
                unknownVariable: null
            })).to.deep.equal([{
                args: {
                    name: 'Rohde',
                    age: 20,
                    city: 'San Francisco'
                },
                subscriptionAlias: null,
                subscriptionName: 'user'
            }]);
        });

        it('should return null if no subscription type', () => {
            const executor = lazyExecutor(noSubscriptionSchema, queries[0]);

            expect(graphqlSubscriptions.extractQueryData(noSubscriptionSchema, executor.parsedQuery, {
                name: 'Rohde',
                age: 20,
                city: 'San Francisco',
                unknownVariable: null
            })).to.be.null;
        });
    });
});
