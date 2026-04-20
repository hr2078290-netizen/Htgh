-- Aviator Club Database Schema
-- Use this file to import into your Hostinger MySQL Database via phpMyAdmin

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` varchar(128) NOT NULL,
  `email` varchar(255) NOT NULL,
  `balance` decimal(15,2) DEFAULT 0.00,
  `referral_balance` decimal(15,2) DEFAULT 0.00,
  `is_admin` tinyint(1) DEFAULT 0,
  `referral_code` varchar(50) DEFAULT NULL,
  `referred_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `game_settings`
--

CREATE TABLE `game_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `game_state` enum('waiting','flying','crashed') DEFAULT 'waiting',
  `current_round` int(11) DEFAULT 1,
  `next_crash_value` decimal(10,2) DEFAULT 2.00,
  `countdown_end_time` timestamp NULL DEFAULT NULL,
  `start_time` timestamp NULL DEFAULT NULL,
  `next_transition_time` timestamp NULL DEFAULT NULL,
  `last_final_value` decimal(10,2) DEFAULT 0.00,
  `pending_next_value` decimal(10,2) DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert initial config
INSERT INTO `game_settings` (id, game_state, current_round, next_crash_value) VALUES (1, 'waiting', 1, 2.00);

-- --------------------------------------------------------

--
-- Table structure for table `history`
--

CREATE TABLE `history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `value` decimal(10,2) NOT NULL,
  `round` int(11) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `user_bets`
--

CREATE TABLE `user_bets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(128) NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `status` enum('active','win','lost') DEFAULT 'active',
  `multiplier` decimal(10,2) DEFAULT NULL,
  `win_amount` decimal(15,2) DEFAULT NULL,
  `final_multiplier` decimal(10,2) DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Table structure for table `active_bets`
--

CREATE TABLE `active_bets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(128) NOT NULL,
  `user_email` varchar(255) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `panel` int(11) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;
