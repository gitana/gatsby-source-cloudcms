const uuidv4 = require(`uuid/v4`);
const cloudcms = require('cloudcms');

const {
    makeRemoteExecutableSchema,
    transformSchema,
    RenameTypes
} = require(`graphql-tools`);

const {
    visitSchema,
    VisitSchemaKind,
} = require(`graphql-tools/dist/transforms/visitSchema`)
const {
    createResolveType,
    fieldMapToFieldConfigMap,
} = require(`graphql-tools/dist/stitching/schemaRecreation`)

const { 
  GraphQLObjectType, GraphQLNonNull, GraphQLSchema,buildSchema, print, printSchema } = require(`gatsby/graphql`);

// Transforms

class NamespaceUnderFieldTransform {
    constructor({ typeName, fieldName, resolver }) {
      this.typeName = typeName
      this.fieldName = fieldName
      this.resolver = resolver
    }
  
    transformSchema(schema) {
      const query = schema.getQueryType()
      let newQuery
      const nestedType = new GraphQLObjectType({
        name: this.typeName,
        fields: () =>
          fieldMapToFieldConfigMap(
            query.getFields(),
            createResolveType(typeName => {
              if (typeName === query.name) {
                return newQuery
              } else {
                return schema.getType(typeName)
              }
            }),
            true
          ),
      })
      newQuery = new GraphQLObjectType({
        name: query.name,
        fields: {
          [this.fieldName]: {
            type: new GraphQLNonNull(nestedType),
            resolve: (parent, args, context, info) => {
              if (this.resolver) {
                return this.resolver(parent, args, context, info)
              } else {
                return {}
              }
            },
          },
        },
      })
      const typeMap = schema.getTypeMap()
      const allTypes = Object.keys(typeMap)
        .filter(name => name !== query.name)
        .map(key => typeMap[key])
  
      return new GraphQLSchema({
        query: newQuery,
        types: allTypes,
      })
    }
}
  
class StripNonQueryTransform {
    transformSchema(schema) {
        return visitSchema(schema, {
            [VisitSchemaKind.MUTATION]() {
                return null
            },
            [VisitSchemaKind.SUBSCRIPTION]() {
                return null
            },
        })
    }
}


exports.sourceNodes = async ({ actions, createNodeId, createContentDigest }, options) => {

    const { createNode, addThirdPartySchema } = actions;
    const {
        repositoryId,
        branchId
    } = options;

    var session = await cloudcms.connect();
    var repository = repositoryId;
    var branch = branchId;

    var schemaString = await session.graphqlSchema(repository, branch);
    var introspectionSchema = buildSchema(schemaString);

    // Performs graphql queries
    const fetcher = async ({ query: queryDocument, variables, operationName, context }) => {
        const query = print(queryDocument);

        var result = await session.graphqlQuery(repository, branch, query, operationName, variables);
        
        return result;
    };

    const remoteSchema = makeRemoteExecutableSchema({
        schema: introspectionSchema,
        fetcher
    });

    // Namespace
    const nodeId = createNodeId("cloudcms-CLOUDCMS")
    const node = createSchemaNode({
        id: nodeId,
        createContentDigest
    })
    createNode(node);

    const resolver = (parent, args, context) => {
        context.nodeModel.createPageDependency({
          path: context.path,
          nodeId: nodeId,
        })
        return {}
    }

    const schema = transformSchema(remoteSchema, [
        new StripNonQueryTransform() ,
        new RenameTypes(name => `CLOUDCMS_${name}`),
        new NamespaceUnderFieldTransform({
          typeName: "CLOUDCMS",
          fieldName: "cloudcms",
          resolver,
        })
      ]);

    addThirdPartySchema({ schema });
};

function createSchemaNode({ id, createContentDigest }) {
  const nodeContent = uuidv4()
  const nodeContentDigest = createContentDigest(nodeContent)
  return {
    id,
    typeName: "CLOUDCMS",
    fieldName: "cloudcms",
    parent: null,
    children: [],
    internal: {
      type: `GraphQLSource`,
      contentDigest: nodeContentDigest,
      ignoreType: true,
    },
  }
}
