const cloudcms = require('cloudcms');
const { createFileNodeFromBuffer } = require("gatsby-source-filesystem");

let session = null;

exports.sourceNodes = async (gatsbyApi, pluginOptions) => {
    const { createNode, createNodeField } = gatsbyApi.actions;
    const { createNodeId, createContentDigest, getCache } = gatsbyApi;
    const { keys, contentQuery, repositoryId, branchId } = pluginOptions;

    session = await cloudcms.connect(keys);

    const batchSize = 500;
    const query = contentQuery || {};

    let lastBatchSize = batchSize;
    let offset = 0;

    while (lastBatchSize == batchSize)
    {
        const result = await session.queryNodes(repositoryId, branchId, query, { limit: batchSize, skip: offset, metadata: true})
        for (let node of result.rows)
        {
            node = normalizeData(node);
            const type = node._type;

            // Replace objects containing ref with a foreign key reference
            node = replaceRelators(node, createNodeId);

            await createNode({
                ...node,
                id: createCloudcmsNodeId(node._doc, createNodeId),
                parent: null,
                children: [],
                internal: {
                    type: type,
                    content: JSON.stringify(node),
                    contentDigest: createContentDigest(node)
                }
            });

            await sourceAttachments(node, repositoryId, branchId, { getCache, createNodeId, createNode, createNodeField });
        }

        lastBatchSize = result.size;
        offset += result.size;
    }


}

function streamToBuffer(stream)
{
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.once('error', (err) => reject(err));
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.once('end', () => resolve(Buffer.concat(chunks)));
    });
}

async function sourceAttachments(node, repositoryId, branchId, { getCache, createNode, createNodeId, createNodeField })
{
    // setup attachments
    if (node._system && node._system.attachments)
    {
        let newSystem = Object.assign({}, node._system);

        for (const [key, value] of Object.entries(node._system.attachments))
        {
            const attachmentStream = await session.downloadAttachment(repositoryId, branchId, node._doc, key);
            const buffer = await streamToBuffer(attachmentStream);

            // Ensure filename does not have extension built in
            let filename = value.filename;
            const dotIndex = filename.indexOf('.');
            filename = filename.substring(0, dotIndex != -1 ? dotIndex : filename.length);

            const file = await createFileNodeFromBuffer({
                buffer,
                getCache,
                createNode,
                createNodeId,
                parentNodeId: node.id,
                ext: `.${value.ext}`,
                name: filename
            });

            newSystem.attachments[key][`path___NODE`] = file.id;
        }

        createNodeField(node, "_system", newSystem);
    }
}

function replaceRelators(obj, createNodeId)
{
    if (obj === Object(obj))
    {
        let result = {};

        for (const [key, value] of Object.entries(obj))
        {   
            if (Array.isArray(value))
            {
                // Check if first item is an object and has a ref. If so, need to change this property key
                if (value.length > 0 && value[0] === Object(value[0]) && "ref" in value[0])
                {
                    result[`${key}___NODE`] = value.map(item => {
                        const tokens = item.ref.split("/");
                        const id = tokens[tokens.length - 1];

                        return createCloudcmsNodeId(id, createNodeId);
                    });
                }
                else
                {
                    // Recurse
                    result[key] = value.map(item => {
                        return replaceRelators(item, createNodeId);
                    });
                }
            }
            else if (value === Object(value))
            {
                if ("ref" in value)
                {
                    const tokens = value.ref.split("/");
                    const id = tokens[tokens.length - 1];
                    result[`${key}___NODE`] = createCloudcmsNodeId(id, createNodeId);
                }
                else
                {
                    // Recurse
                    result[key] = replaceRelators(value, createNodeId);
                }
            }
            else
            {
                result[key] = value;
            }
        }

        return result;
    }
    else 
    {
        return obj;
    }
}

function createCloudcmsNodeId(id, createNodeId)
{
    return createNodeId(`cloudcms-${id}`);
}

function normalizeData(node)
{
    const reserved = ['fields'];
    for (reservedKey of reserved)
    {
        if (reservedKey in node)
        {
            delete node[reservedKey];
        }
    }

    // normalize type by replacing special characters with underscores
    node._type = node._type.replace(/[!$():=@\[\]{|}-]/g, "_");

    return node;
}
