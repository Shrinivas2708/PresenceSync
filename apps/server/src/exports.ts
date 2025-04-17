export const llmResponse = `<MongoArtifact>
<MongoCollection type="CommonCollection" name="Branch">
<MongoData for="Branch">
[{
"name": "IT",
"createdAt": <TIMESTAMP>,
"updatedAt": <TIMESTAMP>
}]
</MongoData>
</MongoCollection>
</MongoArtifact>
<MongoArtifact>
<MongoCollection type="CommonCollection" name="Specialization">
<MongoData for="Specialization">
[{
"name": "SMAD",
"createdAt": <TIMESTAMP>,
"updatedAt": <TIMESTAMP>
}]
</MongoData>
</MongoCollection>
</MongoArtifact>
<MongoArtifact>
<MongoCollection type="CommonCollection" name="Department">
<MongoData for="Department">
[{
"name": "SOC",
"createdAt": <TIMESTAMP>,
"updatedAt": <TIMESTAMP>
}]
</MongoData>
</MongoCollection>
</MongoArtifact>
<MongoInfo type="done">
"Done extracting and finding common fields"
</MongoInfo>
<MongoInfo type="report">
"Duplicate record found: Name: Shrinivas Sherikar, Branch: IT, Specialization: SMAD, Mobile No: 9767655708, Email: ssherikar2005@gmail.com, Department: SOC"
</MongoInfo>
<MongoArtifact>
<MongoCollection type="uniqueCollection" name="Students">
<MongoData for="Students">
[{
"name": "Shrinivas Sherikar",
"mobile_no": "9767655708",
"email": "ssherikar2005@gmail.com",
"branch_id": <Ref type="Branch" name="IT">,
"specialization_id": <Ref type="Specialization" name="SMAD">,
"department_id": <Ref type="Department" name="SOC">,
"createdAt": <TIMESTAMP>,
"updatedAt": <TIMESTAMP>
},
{
"name": "Sanskrti Singh",
"mobile_no": "9768275824",
"email": "sans@gmail.com",
"branch_id": <Ref type="Branch" name="IT">,
"specialization_id": <Ref type="Specialization" name="SMAD">,
"department_id": <Ref type="Department" name="SOC">,
"createdAt": <TIMESTAMP>,
"updatedAt": <TIMESTAMP>
}]
</MongoData>
</MongoCollection>
</MongoArtifact>
<MongoInfo type="done">
"Done with the extracting the unique collection"
</MongoInfo>
<MongoInfo type="exit"/>`;
