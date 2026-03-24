CREATE TABLE `microblogs` (
	`id` BIGINT NOT NULL AUTO_INCREMENT,
	`user` BIGINT NOT NULL DEFAULT '0',
	`message` TEXT NOT NULL,
	`link` TEXT NOT NULL,
	`date` BIGINT NOT NULL DEFAULT '0',
	PRIMARY KEY (`id`)
)
COLLATE='utf8mb4_general_ci'
;