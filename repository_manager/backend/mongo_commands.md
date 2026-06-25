mongod --port 2717 --dbpath "E:\RIO project\Flair\official\replica_sets\mongodb_replica_set\mongos\db1" --replSet FlairReplicaSet --bind_ip_all

mongod --port 2727 --dbpath "E:\RIO project\Flair\official\replica_sets\mongodb_replica_set\mongos\db2" --replSet FlairReplicaSet --bind_ip_all

mongod --port 2737 --dbpath "E:\RIO project\Flair\official\replica_sets\mongodb_replica_set\mongos\db3" --replSet FlairReplicaSet --bind_ip_all

mongosh --host localhost --port 2717

//need to do this only once
rs.initiate({
  _id: "FlairReplicaSet",
  members: [
    { _id: 0, host: "localhost:2717" },
    { _id: 1, host: "localhost:2727" },
    { _id: 2, host: "localhost:2737" }
  ]
});

rs.status()


mongodb://localhost:2717,localhost:2727,localhost:2737/?replicaSet=FlairReplicaSet







