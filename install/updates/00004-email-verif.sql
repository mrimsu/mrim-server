ALTER TABLE `user` ADD `real_email` VARCHAR(255) NOT NULL AFTER `login`;
ALTER TABLE `user` ADD `activated` INT NOT NULL AFTER `microblog_settings`;

CREATE EVENT delete_deactivated ON SCHEDULE EVERY 1 DAY DO DELETE FROM user WHERE activated = 0;
CREATE EVENT clean_email_messages ON SCHEDULE EVERY 1 DAY DO DELETE FROM email_messages;

CREATE TABLE email_messages (
  email_message_id int(11) NOT NULL,
  email_message_type enum('email_verification','password_reset','email_change') NOT NULL,
  email_message_code varchar(72) NOT NULL,
  email_message_for int(11) NOT NULL,
  email_message_data varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE email_messages
  ADD PRIMARY KEY (email_message_id);

ALTER TABLE email_messages
  MODIFY email_message_id int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;
